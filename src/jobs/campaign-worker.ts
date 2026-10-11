import { CampaignStatus } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { CampaignService } from "../services/campaign.service";
import { isMissingSchemaError } from "./webhook-worker";

export const campaignWorkerState = {
    enabled: true,
    running: false,
    lastRunAt: null as Date | null,
    processed: 0,
    failed: 0,
    pausedUntil: null as Date | null
};

const MAX_CAMPAIGNS_PER_TICK = 3;

async function tick() {
    if (campaignWorkerState.running) {
        return;
    }

    if (
        campaignWorkerState.pausedUntil &&
        Date.now() < campaignWorkerState.pausedUntil.getTime()
    ) {
        return;
    }

    campaignWorkerState.running = true;

    try {
        const campaigns = await prisma.campaign.findMany({
            where: {
                status: CampaignStatus.RUNNING
            },
            select: {
                id: true
            },
            orderBy: {
                startedAt: "asc"
            },
            take: MAX_CAMPAIGNS_PER_TICK
        });

        for (const campaign of campaigns) {
            const result = await CampaignService.processCampaignBatch(campaign.id);

            campaignWorkerState.processed += result.sent;
            campaignWorkerState.failed += result.failed;

            if (result.stopped) {
                continue;
            }

            if (result.remaining === 0) {
                await CampaignService.finalizeCampaign(campaign.id);
            }
        }
    } catch (error) {
        if (isMissingSchemaError(error)) {
            campaignWorkerState.pausedUntil = new Date(
                Date.now() + appConfig.webhookSchemaPauseMs
            );

            logger.error(
                { error },
                "El worker de campañas se pausó porque faltan migraciones en la base de datos."
            );
        } else {
            logger.error({ error }, "Falló el ciclo del worker de campañas");
        }
    } finally {
        campaignWorkerState.running = false;
        campaignWorkerState.lastRunAt = new Date();
    }
}

export function startCampaignWorker() {
    const timer = setInterval(() => {
        void tick();
    }, appConfig.campaignWorkerIntervalMs);

    void tick();

    logger.info(
        {
            intervalMs: appConfig.campaignWorkerIntervalMs,
            batchSize: appConfig.campaignBatchSize,
            sendIntervalMs: appConfig.campaignSendIntervalMs
        },
        "Worker de campañas iniciado"
    );

    return timer;
}
