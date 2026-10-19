import { CampaignStatus } from "@prisma/client";

import { prisma } from "../config/prisma";
import { logger } from "../config/logger";
import { CampaignService } from "../services/campaign.service";

/**
 * Despierta las campañas programadas.
 *
 * Cada minuto busca las que ya vencieron, las pasa a READY y las arranca con el
 * mismo camino que usa el botón «Enviar». El envío real lo hace el worker de
 * campañas, así que aquí no se manda ningún mensaje.
 */
export async function runCampaignSchedulerOnce(): Promise<number> {
    const due = await prisma.campaign.findMany({
        where: {
            status: CampaignStatus.SCHEDULED,
            scheduledFor: { lte: new Date() }
        },
        select: { id: true, workspaceId: true, name: true }
    });

    for (const campaign of due) {
        try {
            await prisma.campaign.update({
                where: { id: campaign.id },
                data: { status: CampaignStatus.READY }
            });

            await CampaignService.startCampaign(campaign.workspaceId, campaign.id);
        } catch (error) {
            logger.error(
                { error, campaignId: campaign.id },
                "No se pudo arrancar una campaña programada"
            );
        }
    }

    return due.length;
}

export function startCampaignScheduler(): void {
    const timer = setInterval(() => {
        void runCampaignSchedulerOnce().catch((error) =>
            logger.error({ error }, "Falló el planificador de campañas")
        );
    }, 60_000);

    timer.unref?.();

    logger.info("Planificador de campañas iniciado");
}
