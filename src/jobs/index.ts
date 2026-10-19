import { logger } from "../config/logger";
import { backfillUserEmails } from "./email-hash.job";
import { backfillPhoneHashes } from "./phone-hash.job";
import { startRetentionJob } from "./retention.job";
import { startWebhookWorker } from "./webhook-worker";
import { startCampaignWorker } from "./campaign-worker";
import { startCampaignScheduler } from "./campaign-scheduler.job";
import { startBackupJob } from "./backup.job";

/**
 * Arranca los procesos de fondo de la aplicación: el worker que
 * procesa la cola de webhooks y la retención diaria de datos.
 *
 * Antes de empezar a atender webhooks se recalculan los índices ciegos de
 * teléfono que la migración de cifrado dejó pendientes: si un contacto
 * viejo conservara el marcador, un mensaje entrante crearía un duplicado.
 *
 * El correo de los usuarios se cifra y se indexa en el arranque del
 * servidor, antes de escuchar peticiones (`server.ts`): es lo que hace
 * posible que la gente que ya existía siga entrando.
 */
export async function startBackgroundJobs() {
    try {
        await backfillUserEmails();
    } catch (error) {
        logger.error(
            { error: error instanceof Error ? error.message : error },
            "No se pudo cifrar el correo de los usuarios anteriores al cifrado. " +
                "Si la base todavía no tiene las migraciones aplicadas, se resolverá en el siguiente arranque."
        );
    }

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
    startCampaignScheduler();
    const retentionJob = startRetentionJob();
    const backupJob = startBackupJob();

    return {
        webhookWorker,
        campaignWorker,
        retentionJob,
        backupJob
    };
}
