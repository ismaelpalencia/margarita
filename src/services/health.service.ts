import { WebhookEventStatus } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { retentionState } from "../jobs/retention.job";
import { webhookWorkerState } from "../jobs/webhook-worker";

export class HealthService {
    static async getStatus() {
        let database = "up";
        let databaseError: string | null = null;

        try {
            await prisma.$queryRaw`SELECT 1`;
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
            lagSeconds: null as number | null
        };

        if (database === "up") {
            const [pending, processing, failed, oldestPending] =
                await Promise.all([
                    prisma.webhookEvent.count({
                        where: {
                            status: WebhookEventStatus.PENDING
                        }
                    }),
                    prisma.webhookEvent.count({
                        where: {
                            status: WebhookEventStatus.PROCESSING
                        }
                    }),
                    prisma.webhookEvent.count({
                        where: {
                            status: WebhookEventStatus.FAILED
                        }
                    }),
                    prisma.webhookEvent.findFirst({
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
        }

        const workerStale =
            webhookWorkerState.enabled &&
            webhookWorkerState.lastRunAt !== null &&
            Date.now() - webhookWorkerState.lastRunAt.getTime() >
                appConfig.webhookWorkerIntervalMs * 10;

        const checks = {
            database: database === "up",
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
            database === "down" ||
            checks.webhookQueueHasFailures ||
            workerStale;

        return {
            ok: database === "up",
            app: appConfig.name,
            status: database === "down" ? "unhealthy" : degraded ? "degraded" : "healthy",
            httpStatus: database === "down" ? 503 : 200,
            environment: appConfig.env,
            database,
            databaseError,
            queue,
            worker: {
                enabled: webhookWorkerState.enabled,
                running: webhookWorkerState.running,
                lastRunAt: webhookWorkerState.lastRunAt,
                lastErrorAt: webhookWorkerState.lastErrorAt,
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
