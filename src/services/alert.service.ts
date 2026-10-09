import { appConfig } from "../config/app.config";

type AlertInput = {
    title: string;
    message: string;
    module?: string;
    action?: string;
    workspaceId?: string | null;
    context?: unknown;
    key?: string;
};

const lastSentAt = new Map<string, number>();

/**
 * Envía avisos a un webhook externo (Slack, Discord, Google Chat o
 * cualquier endpoint que reciba JSON) cuando algo falla en producción.
 * Se activa solo si ALERT_WEBHOOK_URL está definido y respeta un
 * enfriamiento por tipo de alerta para no inundar el canal.
 */
export class AlertService {
    static isEnabled(): boolean {
        return Boolean(appConfig.alertWebhookUrl);
    }

    static async notify(input: AlertInput): Promise<boolean> {
        const url = appConfig.alertWebhookUrl;

        if (!url) {
            return false;
        }

        const key = input.key || `${input.module || "APP"}:${input.action || input.title}`;
        const cooldownMs = appConfig.alertCooldownMinutes * 60 * 1000;
        const lastSent = lastSentAt.get(key) || 0;

        if (Date.now() - lastSent < cooldownMs) {
            return false;
        }

        lastSentAt.set(key, Date.now());

        const lines = [
            `[${appConfig.name}] ${input.title}`,
            input.message,
            input.module ? `Módulo: ${input.module}` : null,
            input.action ? `Acción: ${input.action}` : null,
            `Entorno: ${appConfig.env}`,
            `Hora: ${new Date().toISOString()}`
        ].filter(Boolean);

        const text = lines.join("\n");

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    /* Slack y Google Chat leen "text" */
                    text,
                    /* Discord lee "content" */
                    content: text,
                    title: input.title,
                    message: input.message,
                    module: input.module,
                    action: input.action,
                    workspaceId: input.workspaceId || null,
                    environment: appConfig.env,
                    timestamp: new Date().toISOString(),
                    context: input.context || null
                }),
                signal: AbortSignal.timeout(8000)
            });

            return response.ok;
        } catch (error) {
            console.warn(
                "[alert] No se pudo enviar la alerta:",
                error instanceof Error ? error.message : error
            );

            return false;
        }
    }
}
