import { AiJobStatus, LogLevel, LogModule } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { LogService } from "../services/log.service";
import {
    AiSuggestionService,
    SuggestionSkip
} from "../services/ai/suggestion.service";
import { isMissingSchemaError } from "./webhook-worker";

/**
 * Worker de borradores de IA.
 *
 * Es deliberadamente aburrido: reclama un trabajo, llama al modelo una vez,
 * guarda el borrador y sigue. No responde nada por sí solo. Si la base no
 * tiene las migraciones, se pausa en vez de llenar los logs de errores.
 */
export const aiSuggestionWorkerState = {
    enabled: appConfig.ai.enabled,
    running: false,
    lastRunAt: null as Date | null,
    lastErrorAt: null as Date | null,
    processed: 0,
    skipped: 0,
    failed: 0,
    schemaReady: true,
    missingSchema: null as string | null,
    pausedUntil: null as Date | null
};

const BATCH_SIZE = 3;
const STUCK_PROCESSING_MINUTES = 5;
const SCHEMA_PAUSE_MS = 5 * 60 * 1000;
const RETRY_DELAY_MS = 30 * 1000;

function errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(
        0,
        500
    );
}

async function pauseForMissingSchema(error: unknown) {
    const message = errorMessage(error);

    aiSuggestionWorkerState.schemaReady = false;
    aiSuggestionWorkerState.missingSchema = message;
    aiSuggestionWorkerState.pausedUntil = new Date(
        Date.now() + SCHEMA_PAUSE_MS
    );

    logger.error(
        { error: message },
        "El worker de IA se detuvo porque faltan migraciones en la base. " +
            "Corre `npx prisma migrate deploy`: se reactiva solo."
    );
}

async function markFailed(jobId: string, error: unknown) {
    const current = await prisma.aiSuggestionJob.findUnique({
        where: { id: jobId },
        select: { attempts: true }
    });

    const attempts = (current?.attempts || 0) + 1;
    const giveUp = attempts >= appConfig.ai.maxAttempts;

    await prisma.aiSuggestionJob.update({
        where: { id: jobId },
        data: {
            status: giveUp ? AiJobStatus.FAILED : AiJobStatus.PENDING,
            attempts,
            error: errorMessage(error),
            ...(giveUp
                ? {}
                : {
                      runAfter: new Date(
                          Date.now() + RETRY_DELAY_MS * attempts
                      )
                  })
        }
    });

    aiSuggestionWorkerState.failed += 1;
    aiSuggestionWorkerState.lastErrorAt = new Date();

    logger.warn(
        { jobId, attempts, giveUp, error: errorMessage(error) },
        giveUp
            ? "Se agotaron los intentos de generar un borrador de IA."
            : "Falló un borrador de IA; se reintentará."
    );
}

async function processOne(jobId: string, workspaceId: string) {
    try {
        await AiSuggestionService.generateForJob(jobId);

        await prisma.aiSuggestionJob.update({
            where: { id: jobId },
            data: {
                status: AiJobStatus.DONE,
                error: null
            }
        });

        aiSuggestionWorkerState.processed += 1;
    } catch (error) {
        if (error instanceof SuggestionSkip) {
            await prisma.aiSuggestionJob.update({
                where: { id: jobId },
                data: {
                    status: AiJobStatus.SKIPPED,
                    skipReason: error.reason,
                    error: null
                }
            });

            aiSuggestionWorkerState.skipped += 1;

            await LogService.create({
                workspaceId,
                level: LogLevel.DEBUG,
                module: LogModule.AI,
                action: "AI_SUGGESTION_SKIPPED",
                message: "No se generó un borrador de IA.",
                payload: {
                    jobId,
                    reason: error.reason
                }
            }).catch(() => undefined);

            return;
        }

        await markFailed(jobId, error);
    }
}

async function tick() {
    if (!appConfig.ai.enabled) {
        return;
    }

    if (
        aiSuggestionWorkerState.pausedUntil &&
        aiSuggestionWorkerState.pausedUntil.getTime() > Date.now()
    ) {
        return;
    }

    if (aiSuggestionWorkerState.running) {
        return;
    }

    aiSuggestionWorkerState.running = true;

    try {
        /**
         * Un proceso que murió a mitad de una llamada deja el trabajo en
         * `PROCESSING`. A los cinco minutos se devuelve a la cola.
         */
        await prisma.aiSuggestionJob.updateMany({
            where: {
                status: AiJobStatus.PROCESSING,
                updatedAt: {
                    lt: new Date(
                        Date.now() - STUCK_PROCESSING_MINUTES * 60 * 1000
                    )
                }
            },
            data: {
                status: AiJobStatus.PENDING,
                error: "Se reinicia un trabajo que quedó interrumpido."
            }
        });

        for (let index = 0; index < BATCH_SIZE; index += 1) {
            const job = await prisma.aiSuggestionJob.findFirst({
                where: {
                    status: AiJobStatus.PENDING,
                    runAfter: { lte: new Date() }
                },
                orderBy: { runAfter: "asc" },
                select: { id: true, workspaceId: true }
            });

            if (!job) {
                break;
            }

            /**
             * Reclamo atómico: si otro proceso lo tomó, `count` es 0 y se
             * sigue con el siguiente.
             */
            const claimed = await prisma.aiSuggestionJob.updateMany({
                where: {
                    id: job.id,
                    status: AiJobStatus.PENDING
                },
                data: {
                    status: AiJobStatus.PROCESSING
                }
            });

            if (claimed.count === 0) {
                continue;
            }

            await processOne(job.id, job.workspaceId);
        }

        aiSuggestionWorkerState.schemaReady = true;
        aiSuggestionWorkerState.missingSchema = null;
    } catch (error) {
        if (isMissingSchemaError(error)) {
            await pauseForMissingSchema(error);
        } else {
            aiSuggestionWorkerState.lastErrorAt = new Date();
            logger.error(
                { error: errorMessage(error) },
                "Falló una vuelta del worker de IA."
            );
        }
    } finally {
        aiSuggestionWorkerState.running = false;
        aiSuggestionWorkerState.lastRunAt = new Date();
    }
}

export function startAiSuggestionWorker() {
    if (!appConfig.ai.enabled) {
        logger.info(
            "IA apagada (AI_ENABLED=false): no se generan borradores."
        );

        return { stop: () => undefined };
    }

    const timer = setInterval(() => {
        void tick();
    }, appConfig.ai.workerIntervalMs);

    /** No mantiene vivo el proceso por sí solo (tests, scripts). */
    timer.unref?.();

    void tick();

    return {
        stop: () => clearInterval(timer)
    };
}
