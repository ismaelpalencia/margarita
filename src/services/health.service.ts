import { WebhookEventStatus } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { retentionState } from "../jobs/retention.job";
import { webhookWorkerState } from "../jobs/webhook-worker";

/**
 * Superficie mínima del cliente de base de datos que usa el healthcheck.
 * Se declara aparte para poder inyectar un doble en los tests sin tocar
 * una base real.
 */
export type HealthCheckClient = {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
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

        if (database === "up") {
            try {
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

        const checks = {
            database: database === "up",
            webhookQueueReadable: queue.readable,
            webhookWorkerSchemaReady: webhookWorkerState.schemaReady,
            encryptionKeyConfigured: Boolean(appConfig.encryptionKey),
            webhookSignatureConfigured: Boolean(appConfig.metaAppSecret),
            webhookQueueEnabled: appConfig.webhookQueueEnabled,
            webhookWorkerRunning: webhookWorkerState.running,
            webhookWorkerStale: workerStale,
            alertsConfigured: Boolean(appConfig.alertWebhookUrl),
            /** Aviso cuando hay eventos que agotaron sus reintentos. */
            webhookQueueHasFailures: queue.failed > 0
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
            status: unhealthy ? "unhealthy" : degraded ? "degraded" : "healthy",
            httpStatus: unhealthy ? 503 : 200,
            environment: appConfig.env,
            database,
            databaseError,
            migrationHint: migrationsMissing
                ? "La base de datos no tiene aplicadas las migraciones más recientes. Corre `npx prisma migrate deploy` contra esta base."
                : null,
            queue,
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
            checks,
            timestamp: new Date().toISOString()
        };
    }
}
