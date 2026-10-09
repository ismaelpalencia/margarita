import { WebhookEventStatus } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { MetaWebhookHandlerService } from "../services/meta-webhook-handler.service";
import { MetaWebhookPayload } from "../types/meta-webhook";
import { extractPhoneNumberId } from "../utils/meta-payload";

type WebhookEventRecord = {
    id: string;
    workspaceId: string | null;
    attempts: number;
    payload: unknown;
};

export const webhookWorkerState = {
    enabled: appConfig.webhookQueueEnabled,
    running: false,
    lastRunAt: null as Date | null,
    lastErrorAt: null as Date | null,
    processed: 0,
    failed: 0
};

const BATCH_SIZE = 10;
const STUCK_PROCESSING_MINUTES = 5;

async function claimNextEvent(): Promise<WebhookEventRecord | null> {
    const candidate = await prisma.webhookEvent.findFirst({
        where: {
            status: WebhookEventStatus.PENDING,
            nextAttemptAt: {
                lte: new Date()
            }
        },
        orderBy: {
            createdAt: "asc"
        },
        select: {
            id: true,
            workspaceId: true,
            attempts: true,
            payload: true
        }
    });

    if (!candidate) {
        return null;
    }

    // El updateMany condicional hace de candado: si otro proceso lo tomó
    // primero, este no lo vuelve a procesar.
    const claimed = await prisma.webhookEvent.updateMany({
        where: {
            id: candidate.id,
            status: WebhookEventStatus.PENDING
        },
        data: {
            status: WebhookEventStatus.PROCESSING,
            attempts: {
                increment: 1
            }
        }
    });

    if (claimed.count === 0) {
        return null;
    }

    return {
        id: candidate.id,
        workspaceId: candidate.workspaceId,
        attempts: candidate.attempts + 1,
        payload: candidate.payload
    };
}

async function resolveWorkspaceId(
    event: WebhookEventRecord,
    payload: MetaWebhookPayload
): Promise<string | null> {
    if (event.workspaceId) {
        return event.workspaceId;
    }

    const phoneNumberId = extractPhoneNumberId(payload);

    if (!phoneNumberId) {
        return null;
    }

    const account = await prisma.whatsAppAccount.findFirst({
        where: {
            phoneNumberId
        },
        select: {
            workspaceId: true
        }
    });

    if (account) {
        await prisma.webhookEvent.update({
            where: {
                id: event.id
            },
            data: {
                workspaceId: account.workspaceId,
                phoneNumberId
            }
        });
    }

    return account?.workspaceId || null;
}

async function processEvent(event: WebhookEventRecord) {
    const payload = event.payload as MetaWebhookPayload;

    try {
        await resolveWorkspaceId(event, payload);

        await MetaWebhookHandlerService.handleIncomingPayload(payload);

        await prisma.webhookEvent.update({
            where: {
                id: event.id
            },
            data: {
                status: WebhookEventStatus.PROCESSED,
                processedAt: new Date(),
                lastError: null
            }
        });

        webhookWorkerState.processed++;
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Error desconocido";

        webhookWorkerState.lastErrorAt = new Date();

        const exhausted = event.attempts >= appConfig.webhookMaxAttempts;

        if (exhausted) {
            webhookWorkerState.failed++;

            await prisma.webhookEvent.update({
                where: {
                    id: event.id
                },
                data: {
                    status: WebhookEventStatus.FAILED,
                    lastError: message
                }
            });

            logger.error(
                {
                    webhookEventId: event.id,
                    attempts: event.attempts,
                    error: message
                },
                "Evento de webhook agotó sus reintentos"
            );

            // Queda en la bitácora y, si hay ALERT_WEBHOOK_URL configurado,
            // dispara el aviso externo.
            await MetaWebhookHandlerService.logProcessorFailure({
                webhookEventId: event.id,
                attempts: event.attempts,
                error: message
            });

            return;
        }

        const delayMs = Math.min(2 ** event.attempts * 1000, 5 * 60 * 1000);

        await prisma.webhookEvent.update({
            where: {
                id: event.id
            },
            data: {
                status: WebhookEventStatus.PENDING,
                lastError: message,
                nextAttemptAt: new Date(Date.now() + delayMs)
            }
        });

        logger.warn(
            {
                webhookEventId: event.id,
                attempts: event.attempts,
                retryInMs: delayMs,
                error: message
            },
            "Evento de webhook reprogramado para reintento"
        );
    }
}

// Devuelve a la cola los eventos que quedaron en PROCESSING porque el
// proceso se cayó a mitad del trabajo.
async function reclaimStuckEvents() {
    const cutoff = new Date(Date.now() - STUCK_PROCESSING_MINUTES * 60 * 1000);

    const reclaimed = await prisma.webhookEvent.updateMany({
        where: {
            status: WebhookEventStatus.PROCESSING,
            updatedAt: {
                lt: cutoff
            }
        },
        data: {
            status: WebhookEventStatus.PENDING,
            nextAttemptAt: new Date(),
            lastError: "Reprogramado tras una interrupción del proceso."
        }
    });

    if (reclaimed.count > 0) {
        logger.warn(
            { count: reclaimed.count },
            "Eventos de webhook en PROCESSING devueltos a la cola"
        );
    }
}

async function tick() {
    if (webhookWorkerState.running) {
        return;
    }

    webhookWorkerState.running = true;

    try {
        await reclaimStuckEvents();

        for (let index = 0; index < BATCH_SIZE; index++) {
            const event = await claimNextEvent();

            if (!event) {
                break;
            }

            await processEvent(event);
        }
    } catch (error) {
        logger.error({ error }, "Falló el ciclo del worker de webhooks");
    } finally {
        webhookWorkerState.running = false;
        webhookWorkerState.lastRunAt = new Date();
    }
}

export function startWebhookWorker() {
    if (!appConfig.webhookQueueEnabled) {
        logger.warn(
            "Cola de webhooks deshabilitada por configuración (WEBHOOK_QUEUE_ENABLED=false)."
        );

        return null;
    }

    const timer = setInterval(() => {
        void tick();
    }, appConfig.webhookWorkerIntervalMs);

    void tick();

    logger.info(
        {
            intervalMs: appConfig.webhookWorkerIntervalMs,
            maxAttempts: appConfig.webhookMaxAttempts
        },
        "Worker de webhooks iniciado"
    );

    return timer;
}
