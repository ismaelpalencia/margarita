export type WebhookTelemetrySnapshot = {
    received: number;
    enqueued: number;
    rejected: number;
    lastReceivedAt: Date | null;
    lastEnqueuedAt: Date | null;
    lastRejectionAt: Date | null;
    lastRejectionReason: string | null;
};

const state = {
    received: 0,
    enqueued: 0,
    rejected: 0,
    lastReceivedAt: null as Date | null,
    lastEnqueuedAt: null as Date | null,
    lastRejectionAt: null as Date | null,
    lastRejectionReason: null as string | null
};

/**
 * Contadores en memoria de lo que llega al endpoint del webhook.
 *
 * Sin esto, un webhook rechazado por firma inválida no dejaba rastro
 * visible: no entra a la cola, así que /health decía "todo bien" aunque
 * Meta estuviera recibiendo 401 en cada intento. Estos números permiten
 * distinguir "Meta no envía nada" de "Meta envía y lo estamos
 * rechazando" con solo mirar /health.
 *
 * Se reinician en cada arranque del servicio.
 */
export const webhookTelemetry = {
    recordReceived() {
        state.received++;
        state.lastReceivedAt = new Date();
    },

    recordEnqueued() {
        state.enqueued++;
        state.lastEnqueuedAt = new Date();
    },

    recordRejected(reason: string) {
        state.rejected++;
        state.lastRejectionAt = new Date();
        state.lastRejectionReason = reason;
    },

    getSnapshot(): WebhookTelemetrySnapshot {
        return { ...state };
    }
};
