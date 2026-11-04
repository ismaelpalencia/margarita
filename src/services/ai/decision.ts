/**
 * Política de decisión de la fase 1.
 *
 * Vive en código puro y probado, no dentro del prompt: el modelo puede
 * equivocarse, pero las reglas de «a quién no se le responde» no se negocian.
 */

export type SuggestionSkipReason =
    | "AI_DISABLED"
    | "WORKSPACE_OFF"
    | "MODE_NOT_SUGGEST"
    | "MESSAGE_NOT_INBOUND"
    | "MESSAGE_DELETED"
    | "CONTACT_OPTED_OUT"
    | "CONTACT_PAUSED"
    | "CONVERSATION_CLOSED"
    | "MESSAGE_EMPTY"
    | "WINDOW_CLOSED"
    | "SUPERSEDED"
    | "HUMAN_REPLIED";

export type SuggestionDecisionInput = {
    globalEnabled: boolean;
    settings: {
        enabled: boolean;
        mode: "OFF" | "SUGGEST" | "AUTO";
    } | null;
    contact: {
        optOutAt: Date | null;
        pausedAt: Date | null;
    };
    conversation: {
        status: "OPEN" | "CLOSED" | "ARCHIVED";
        lastIncomingMessageAt: Date | null;
    };
    message: {
        direction: "IN" | "OUT";
        body: string | null;
        replyTitle: string | null;
        deletedAt: Date | null;
        createdAt: Date;
    };
    /** Hay un mensaje entrante más nuevo en el mismo hilo. */
    newerInboundExists: boolean;
    /** Una persona ya contestó después del mensaje que originó el trabajo. */
    humanRepliedAfter: boolean;
    now: Date;
};

export type SuggestionDecision =
    | { generate: true; text: string }
    | { generate: false; reason: SuggestionSkipReason };

const WINDOW_MS = 24 * 60 * 60 * 1000;

export function decideSuggestion(
    input: SuggestionDecisionInput
): SuggestionDecision {
    if (!input.globalEnabled) {
        return { generate: false, reason: "AI_DISABLED" };
    }

    if (!input.settings?.enabled) {
        return { generate: false, reason: "WORKSPACE_OFF" };
    }

    if (input.settings.mode !== "SUGGEST") {
        return { generate: false, reason: "MODE_NOT_SUGGEST" };
    }

    /** Nunca se responde a quien pidió la baja o está en revisión. */
    if (input.contact.optOutAt) {
        return { generate: false, reason: "CONTACT_OPTED_OUT" };
    }

    if (input.contact.pausedAt) {
        return { generate: false, reason: "CONTACT_PAUSED" };
    }

    if (input.message.direction !== "IN") {
        return { generate: false, reason: "MESSAGE_NOT_INBOUND" };
    }

    if (input.message.deletedAt) {
        return { generate: false, reason: "MESSAGE_DELETED" };
    }

    if (input.conversation.status !== "OPEN") {
        return { generate: false, reason: "CONVERSATION_CLOSED" };
    }

    const text = (input.message.body || input.message.replyTitle || "").trim();

    if (text.length === 0) {
        return { generate: false, reason: "MESSAGE_EMPTY" };
    }

    const lastInbound =
        input.conversation.lastIncomingMessageAt || input.message.createdAt;

    if (input.now.getTime() - lastInbound.getTime() > WINDOW_MS) {
        return { generate: false, reason: "WINDOW_CLOSED" };
    }

    /** Llegó otro mensaje: el trabajo del más nuevo es el que responde. */
    if (input.newerInboundExists) {
        return { generate: false, reason: "SUPERSEDED" };
    }

    /** Si una persona ya tomó el control, no hay nada que sugerir. */
    if (input.humanRepliedAfter) {
        return { generate: false, reason: "HUMAN_REPLIED" };
    }

    return { generate: true, text };
}

const REASON_LABELS: Record<SuggestionSkipReason, string> = {
    AI_DISABLED: "La IA está apagada en la instalación.",
    WORKSPACE_OFF: "La IA está apagada en este workspace.",
    MODE_NOT_SUGGEST: "El workspace no está en modo sugerencia.",
    MESSAGE_NOT_INBOUND: "El mensaje no es del cliente.",
    MESSAGE_DELETED: "El mensaje fue eliminado.",
    CONTACT_OPTED_OUT: "El contacto pidió la baja.",
    CONTACT_PAUSED: "La cuenta está en revisión.",
    CONVERSATION_CLOSED: "La conversación está cerrada.",
    MESSAGE_EMPTY: "El mensaje no tiene texto que responder.",
    WINDOW_CLOSED: "La ventana de 24 horas está cerrada.",
    SUPERSEDED: "Llegó un mensaje más nuevo; se atiende ese.",
    HUMAN_REPLIED: "Una persona ya contestó."
};

export function suggestionSkipLabel(reason: SuggestionSkipReason): string {
    return REASON_LABELS[reason];
}
