/**
 * Política de decisión de las fases 1 y 2.
 *
 * Vive en código puro y probado, no dentro del prompt: el modelo puede
 * equivocarse, pero las reglas de «a quién no se le responde» no se negocian.
 *
 * - `decideSuggestion`: ¿se genera un borrador? (fase 1)
 * - `decideGeneration`: ¿se llama al modelo? (sirve para sugerencia y automático)
 * - `decideAutoReply`: ¿se puede enviar solo lo que propuso el modelo? (fase 2)
 */

export type SuggestionSkipReason =
    | "AI_DISABLED"
    | "WORKSPACE_OFF"
    | "MODE_NOT_SUGGEST"
    | "MODE_NOT_ACTIVE"
    | "MESSAGE_NOT_INBOUND"
    | "MESSAGE_DELETED"
    | "CONTACT_OPTED_OUT"
    | "CONTACT_PAUSED"
    | "CONVERSATION_CLOSED"
    | "CONVERSATION_AI_PAUSED"
    | "MESSAGE_EMPTY"
    | "WINDOW_CLOSED"
    | "SUPERSEDED"
    | "HUMAN_REPLIED"
    | "MODE_NOT_AUTO"
    | "HANDOFF_REQUIRED"
    | "LOW_CONFIDENCE"
    | "NO_KNOWLEDGE"
    | "EMPTY_REPLY"
    | "DAILY_LIMIT"
    | "THREAD_LIMIT"
    | "BUDGET_EXCEEDED";

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
        /** Pausa explícita de la IA en este hilo (control humano). */
        aiPausedAt?: Date | null;
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

export type AutoReplyDecisionInput = {
    settings: {
        mode: "OFF" | "SUGGEST" | "AUTO";
        confidenceMin: number;
        maxRepliesPerDay: number;
        maxRepliesPerThread: number;
        monthlyBudgetCents: number;
    };
    contact: {
        optOutAt: Date | null;
        pausedAt: Date | null;
    };
    conversation: {
        status: "OPEN" | "CLOSED" | "ARCHIVED";
        lastIncomingMessageAt: Date | null;
        aiPausedAt: Date | null;
    };
    /** Una persona ya contestó después del mensaje que originó el trabajo. */
    humanRepliedAfter: boolean;
    reply: {
        body: string;
        confidence: number;
        handoff: boolean;
    };
    /** Entradas de la base de conocimiento que se usaron en el prompt. */
    knowledgeEntriesUsed: number;
    usage: {
        repliesToday: number;
        repliesInThread: number;
        spentMicrosThisMonth: number;
    };
    now: Date;
};

export type AutoReplyDecision =
    | { send: true; text: string }
    | { send: false; reason: SuggestionSkipReason };

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MICROS_PER_CENT = 10_000;
const MAX_AUTO_REPLY_LENGTH = 2000;

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

    return decideGeneration(input);
}

/**
 * ¿Se debe llamar al modelo? Es la parte común de los dos modos activos.
 * El modo automático no salta ninguna de estas compuertas: además tendrá
 * que pasar `decideAutoReply` antes de enviar.
 */
export function decideGeneration(
    input: SuggestionDecisionInput
): SuggestionDecision {
    if (!input.globalEnabled) {
        return { generate: false, reason: "AI_DISABLED" };
    }

    if (!input.settings?.enabled) {
        return { generate: false, reason: "WORKSPACE_OFF" };
    }

    if (input.settings.mode === "OFF") {
        return { generate: false, reason: "MODE_NOT_ACTIVE" };
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

    if (input.conversation.aiPausedAt) {
        return { generate: false, reason: "CONVERSATION_AI_PAUSED" };
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

/**
 * Última compuerta antes de mandar solo. Se evalúa con datos frescos, no
 * con los del momento en que se encoló el trabajo: entre una cosa y otra
 * pudo contestar una persona, cerrarse la ventana o agotarse el límite.
 */
export function decideAutoReply(
    input: AutoReplyDecisionInput
): AutoReplyDecision {
    if (input.settings.mode !== "AUTO") {
        return { send: false, reason: "MODE_NOT_AUTO" };
    }

    if (input.contact.optOutAt) {
        return { send: false, reason: "CONTACT_OPTED_OUT" };
    }

    if (input.contact.pausedAt) {
        return { send: false, reason: "CONTACT_PAUSED" };
    }

    if (input.conversation.status !== "OPEN") {
        return { send: false, reason: "CONVERSATION_CLOSED" };
    }

    /** Una persona tomó el hilo: la IA se aparta hasta que la reactiven. */
    if (input.conversation.aiPausedAt) {
        return { send: false, reason: "CONVERSATION_AI_PAUSED" };
    }

    if (!input.conversation.lastIncomingMessageAt) {
        return { send: false, reason: "WINDOW_CLOSED" };
    }

    const elapsed =
        input.now.getTime() - input.conversation.lastIncomingMessageAt.getTime();

    if (elapsed < 0 || elapsed > WINDOW_MS) {
        return { send: false, reason: "WINDOW_CLOSED" };
    }

    if (input.humanRepliedAfter) {
        return { send: false, reason: "HUMAN_REPLIED" };
    }

    /** El modelo pidió ayuda o marcó el tema como sensible. */
    if (input.reply.handoff) {
        return { send: false, reason: "HANDOFF_REQUIRED" };
    }

    if (input.reply.confidence < input.settings.confidenceMin) {
        return { send: false, reason: "LOW_CONFIDENCE" };
    }

    /** Sin conocimiento recuperado no hay de dónde responder: no se inventa. */
    if (input.knowledgeEntriesUsed <= 0) {
        return { send: false, reason: "NO_KNOWLEDGE" };
    }

    const text = input.reply.body.trim();

    if (text.length === 0) {
        return { send: false, reason: "EMPTY_REPLY" };
    }

    if (text.length > MAX_AUTO_REPLY_LENGTH) {
        return { send: false, reason: "EMPTY_REPLY" };
    }

    if (input.usage.repliesToday >= input.settings.maxRepliesPerDay) {
        return { send: false, reason: "DAILY_LIMIT" };
    }

    if (input.usage.repliesInThread >= input.settings.maxRepliesPerThread) {
        return { send: false, reason: "THREAD_LIMIT" };
    }

    const budgetMicros =
        Math.max(0, input.settings.monthlyBudgetCents) * MICROS_PER_CENT;

    if (budgetMicros <= 0 || input.usage.spentMicrosThisMonth >= budgetMicros) {
        return { send: false, reason: "BUDGET_EXCEEDED" };
    }

    return { send: true, text };
}

const REASON_LABELS: Record<SuggestionSkipReason, string> = {
    AI_DISABLED: "La IA está apagada en la instalación.",
    WORKSPACE_OFF: "La IA está apagada en este workspace.",
    MODE_NOT_SUGGEST: "El workspace no está en modo sugerencia.",
    MODE_NOT_ACTIVE: "La IA está apagada en este workspace.",
    MESSAGE_NOT_INBOUND: "El mensaje no es del cliente.",
    MESSAGE_DELETED: "El mensaje fue eliminado.",
    CONTACT_OPTED_OUT: "El contacto pidió la baja.",
    CONTACT_PAUSED: "La cuenta está en revisión.",
    CONVERSATION_CLOSED: "La conversación está cerrada.",
    CONVERSATION_AI_PAUSED: "Una persona pausó la IA en esta conversación.",
    MESSAGE_EMPTY: "El mensaje no tiene texto que responder.",
    WINDOW_CLOSED: "La ventana de 24 horas está cerrada.",
    SUPERSEDED: "Llegó un mensaje más nuevo; se atiende ese.",
    HUMAN_REPLIED: "Una persona ya contestó.",
    MODE_NOT_AUTO: "El workspace no está en modo automático.",
    HANDOFF_REQUIRED: "El tema requiere una persona.",
    LOW_CONFIDENCE: "La confianza no alcanza el mínimo configurado.",
    NO_KNOWLEDGE: "La base de conocimiento no cubre la pregunta.",
    EMPTY_REPLY: "La IA no devolvió una respuesta utilizable.",
    DAILY_LIMIT: "Se alcanzó el límite diario de respuestas automáticas.",
    THREAD_LIMIT: "Se alcanzó el límite de respuestas automáticas en este hilo.",
    BUDGET_EXCEEDED: "Se agotó el presupuesto mensual de IA."
};

export function suggestionSkipLabel(reason: SuggestionSkipReason): string {
    return REASON_LABELS[reason];
}
