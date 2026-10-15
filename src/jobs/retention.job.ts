import { WebhookEventStatus } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { SessionService } from "../services/session.service";

export const retentionState = {
    lastRunAt: null as Date | null,
    lastResult: null as {
        logsDeleted: number;
        eventsDeleted: number;
        sessionsClosed: number;
    } | null
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Borra los registros que ya cumplieron su ventana de retención: bitácora
// general y eventos de webhook ya procesados. Mantiene la base acotada y
// reduce la exposición de datos personales con el tiempo.
export async function runRetention() {
    const now = Date.now();

    const logCutoff = new Date(now - appConfig.logRetentionDays * ONE_DAY_MS);

    const eventCutoff = new Date(
        now - appConfig.webhookEventRetentionDays * ONE_DAY_MS
    );

    const logs = await prisma.log.deleteMany({
        where: {
            createdAt: {
                lt: logCutoff
            }
        }
    });

    const events = await prisma.webhookEvent.deleteMany({
        where: {
            createdAt: {
                lt: eventCutoff
            },
            status: {
                in: [WebhookEventStatus.PROCESSED, WebhookEventStatus.FAILED]
            }
        }
    });

    /**
     * Sesiones abandonadas: se marcan inactivas las vencidas o sin uso. No
     * se borran, porque el historial de accesos sirve para auditar.
     */
    const sessionsClosed = await SessionService.purgeStale();

    const result = {
        logsDeleted: logs.count,
        eventsDeleted: events.count,
        sessionsClosed
    };

    retentionState.lastRunAt = new Date();
    retentionState.lastResult = result;

    if (result.logsDeleted > 0 || result.eventsDeleted > 0) {
        logger.info(result, "Retención de datos aplicada");
    }

    return result;
}

export function startRetentionJob() {
    const timer = setInterval(() => {
        void runRetention().catch((error) => {
            logger.error({ error }, "Falló la retención de datos");
        });
    }, ONE_DAY_MS);

    void runRetention().catch((error) => {
        logger.error({ error }, "Falló la retención de datos");
    });

    return timer;
}
