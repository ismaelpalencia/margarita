import { logger } from "../config/logger";
import { backfillPhoneHashes } from "./phone-hash.job";
import { startRetentionJob } from "./retention.job";
import { startWebhookWorker } from "./webhook-worker";
import { startCampaignWorker } from "./campaign-worker";

/**
 * Arranca los procesos de fondo de la aplicación: el worker que
 * procesa la cola de webhooks y la retención diaria de datos.
 *
 * Antes de empezar a atender webhooks se recalculan los índices ciegos de
 * teléfono que la migración de cifrado dejó pendientes: si un contacto
 * viejo conservara el marcador, un mensaje entrante crearía un duplicado.
 */
export async function startBackgroundJobs() {
    try {
        await backfillPhoneHashes();
    } catch (error) {
        logger.error(
            { error: error instanceof Error ? error.message : error },
            "No se pudo recalcular los índices de teléfono de los contactos. " +
                "Si la base todavía no tiene las migraciones aplicadas, se resolverá en el siguiente arranque."
        );
    }

    const webhookWorker = startWebhookWorker();
    const campaignWorker = startCampaignWorker();
    const retentionJob = startRetentionJob();

    return {
        webhookWorker,
        campaignWorker,
        retentionJob
    };
}
