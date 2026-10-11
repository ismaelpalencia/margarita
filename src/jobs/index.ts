import { startRetentionJob } from "./retention.job";
import { startWebhookWorker } from "./webhook-worker";
import { startCampaignWorker } from "./campaign-worker";

/**
 * Arranca los procesos de fondo de la aplicación: el worker que
 * procesa la cola de webhooks y la retención diaria de datos.
 */
export function startBackgroundJobs() {
    const webhookWorker = startWebhookWorker();
    const campaignWorker = startCampaignWorker();
    const retentionJob = startRetentionJob();

    return {
        webhookWorker,
        campaignWorker,
        retentionJob
    };
}
