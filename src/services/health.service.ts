import { WebhookEventStatus } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { retentionState } from "../jobs/retention.job";
import { webhookWorkerState } from "../jobs/webhook-worker";
import { aiSuggestionWorkerState } from "../jobs/ai-suggestion.job";
import { webhookTelemetry } from "./webhook-telemetry.service";
import { BackupFileService } from "./backup-file.service";
import { storageStatus } from "./storage-status.service";
import { objectStorageConfig } from "./object-storage.service";

/**
 * Superficie mínima del cliente de base de datos que usa el healthcheck.
 * Se declara aparte para poder inyectar un doble en los tests sin tocar
 * una base real.
 */
export type HealthCheckClient = {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
    user: {
        count: (args: {
            where: { role: "ADMIN"; isActive: boolean };
        }) => Promise<number>;
    };
    webhookEvent: {
        count: (args: {
            where: { status: WebhookEventStatus };
        }) => Promise<number>;
        findFirst: (args: {
            where: { status: WebhookEventStatus };
            orderBy: { createdAt: "asc" };
            select: { createdAt: true };
        }) => Promise<{ createdAt: Date } | null>;
    };
};

export class HealthService {
    static async getStatus(
        client: HealthCheckClient = prisma as unknown as HealthCheckClient
    ) {
        let database = "up";
        let databaseError: string | null = null;

        try {
            await client.$queryRaw`SELECT 1`;
        } catch (error) {
            database = "down";
            databaseError =
                error instanceof Error ? error.message : "Error desconocido";
        }

        const queue = {
            pending: 0,
            processing: 0,
            failed: 0,
            oldestPendingAt: null as Date | null,
            lagSeconds: null as number | null,
            readable: true,
            error: null as string | null
        };

        let adminUsers: number | null = null;

        if (database === "up") {
            try {
                adminUsers = await client.user.count({
                    where: {
                        role: "ADMIN",
                        isActive: true
                    }
                });

                const [pending, processing, failed, oldestPending] =
                    await Promise.all([
                    client.webhookEvent.count({
                        where: {
                            status: WebhookEventStatus.PENDING
                        }
                    }),
                    client.webhookEvent.count({
                        where: {
                            status: WebhookEventStatus.PROCESSING
                        }
                    }),
                    client.webhookEvent.count({
                        where: {
                            status: WebhookEventStatus.FAILED
                        }
                    }),
                    client.webhookEvent.findFirst({
                        where: {
                            status: WebhookEventStatus.PENDING
                        },
                        orderBy: {
                            createdAt: "asc"
                        },
                        select: {
                            createdAt: true
                        }
                    })
                ]);

                queue.pending = pending;
                queue.processing = processing;
                queue.failed = failed;
                queue.oldestPendingAt = oldestPending?.createdAt || null;
                queue.lagSeconds = oldestPending
                    ? Math.round(
                          (Date.now() - oldestPending.createdAt.getTime()) / 1000
                      )
                    : 0;
            } catch (error) {
                /**
                 * Si la consulta falla (por ejemplo, la base no tiene
                 * aplicadas las migraciones), el healthcheck debe
                 * reportarlo en lugar de tumbar el proceso.
                 */
                queue.readable = false;
                queue.error =
                    error instanceof Error ? error.message : "Error desconocido";
            }
        }

        const workerStale =
            webhookWorkerState.enabled &&
            webhookWorkerState.lastRunAt !== null &&
            Date.now() - webhookWorkerState.lastRunAt.getTime() >
                appConfig.webhookWorkerIntervalMs * 10;

        /**
         * Respaldos: si el último tiene más de `BACKUP_MAX_AGE_HOURS`, se
         * reporta como viejo. No tumba el healthcheck (el servicio está
         * funcionando), pero queda a la vista y el job ya lo registra como
         * error, que es lo que dispara las alertas.
         */
        const backups = await BackupFileService.status().catch(() => null);

        /**
         * Almacenamiento de archivos. Sin un Volume, cada despliegue borra las
         * fotos y documentos de las conversaciones; no tumba el healthcheck
         * (el servicio está vivo), pero queda dicho en la respuesta y en el
         * panel de Sistema.
         */
        const storage = storageStatus();

        const checks = {
            database: database === "up",
            webhookQueueReadable: queue.readable,
            webhookWorkerSchemaReady: webhookWorkerState.schemaReady,
            /** Si es false, Meta no está entregando nada a este servicio. */
            webhooksArriving: webhookTelemetry.getSnapshot().received > 0,
            /**
             * Sin un admin activo no se puede iniciar sesión: el login
             * responde "Credenciales incorrectas" aunque todo lo demás
             * esté bien. Normalmente significa que falta correr el seed.
             */
            adminUserExists: adminUsers !== null && adminUsers > 0,
            encryptionKeyConfigured: Boolean(appConfig.encryptionKey),
            /** El App Secret real de Meta son 32 caracteres hexadecimales. */
            appSecretFormatLooksValid: /^[0-9a-f]{32}$/i.test(
                appConfig.metaAppSecret
            ),
            webhookSignatureConfigured: Boolean(appConfig.metaAppSecret),
            webhookQueueEnabled: appConfig.webhookQueueEnabled,
            webhookWorkerRunning: webhookWorkerState.running,
            webhookWorkerStale: workerStale,
            alertsConfigured: Boolean(appConfig.alertWebhookUrl),
            /** Aviso cuando hay eventos que agotaron sus reintentos. */
            webhookQueueHasFailures: queue.failed > 0,
            backupsFresh: Boolean(backups && backups.enabled && !backups.stale),
            /** Archivos en un Volume: sobreviven a los despliegues. */
            mediaStoragePersistent: storage.persistent
        };

        const degraded =
            checks.webhookQueueHasFailures || workerStale;

        const unhealthy = database === "down" || !queue.readable;

        /**
         * Cuando falta una migración el error de Postgres trae este texto.
         * Lo traducimos a una instrucción accionable.
         */
        const migrationsMissing =
            !queue.readable &&
            typeof queue.error === "string" &&
            /does not exist|no existe/i.test(queue.error);

        return {
            ok: database === "up",
            app: appConfig.name,
            version: appConfig.version,
            commit: appConfig.commit || null,
            status: unhealthy ? "unhealthy" : degraded ? "degraded" : "healthy",
            httpStatus: unhealthy ? 503 : 200,
            environment: appConfig.env,
            /** URL pública que la app cree tener, para detectar APP_URL mal puesto. */
            publicUrl: appConfig.appUrl,
            database,
            databaseError,
            migrationHint: migrationsMissing
                ? "La base de datos no tiene aplicadas las migraciones más recientes. Corre `npx prisma migrate deploy` contra esta base."
                : null,
            queue,
            accounts: {
                adminUsers
            },
            /** Lo que realmente llegó al endpoint del webhook desde el último arranque. */
            webhook: webhookTelemetry.getSnapshot(),
            worker: {
                enabled: webhookWorkerState.enabled,
                running: webhookWorkerState.running,
                lastRunAt: webhookWorkerState.lastRunAt,
                lastErrorAt: webhookWorkerState.lastErrorAt,
                schemaReady: webhookWorkerState.schemaReady,
                missingSchema: webhookWorkerState.missingSchema,
                pausedUntil: webhookWorkerState.pausedUntil,
                processed: webhookWorkerState.processed,
                failed: webhookWorkerState.failed
            },
            retention: {
                logRetentionDays: appConfig.logRetentionDays,
                webhookEventRetentionDays: appConfig.webhookEventRetentionDays,
                lastRunAt: retentionState.lastRunAt,
                lastResult: retentionState.lastResult
            },
            /**
             * Worker de borradores de IA. Con `AI_ENABLED=false` aparece
             * apagado y no consulta nada: la instalación funciona igual.
             */
            ai: {
                enabled: aiSuggestionWorkerState.enabled,
                running: aiSuggestionWorkerState.running,
                lastRunAt: aiSuggestionWorkerState.lastRunAt,
                lastErrorAt: aiSuggestionWorkerState.lastErrorAt,
                schemaReady: aiSuggestionWorkerState.schemaReady,
                missingSchema: aiSuggestionWorkerState.missingSchema,
                pausedUntil: aiSuggestionWorkerState.pausedUntil,
                processed: aiSuggestionWorkerState.processed,
                skipped: aiSuggestionWorkerState.skipped,
                failed: aiSuggestionWorkerState.failed
            },
            /** Respaldos automáticos: edad del último y si está viejo. */
            backups: backups
                ? {
                      enabled: backups.enabled,
                      count: backups.count,
                      lastAt: backups.lastAt,
                      ageHours:
                          backups.ageHours === null
                              ? null
                              : Math.round(backups.ageHours * 10) / 10,
                      maxAgeHours: backups.maxAgeHours,
                      stale: backups.stale,
                      dir: backups.dir,
                      /**
                       * Copia fuera del servidor: hoy los respaldos se suben
                       * a R2 si las credenciales están puestas. Los archivos de
                       * las conversaciones siguen en disco hasta el siguiente
                       * cambio.
                       */
                      offsite: Boolean(objectStorageConfig())
                  }
                : null,
            storage,
            checks,
            timestamp: new Date().toISOString()
        };
    }
}
