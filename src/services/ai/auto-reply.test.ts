import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideAutoReply, AutoReplyDecisionInput } from "./decision";
import test from "node:test";

function baseInput(
    overrides: Partial<AutoReplyDecisionInput> = {}
): AutoReplyDecisionInput {
    return {
        settings: {
            mode: "AUTO",
            confidenceMin: 0.7,
            maxRepliesPerDay: 50,
            maxRepliesPerThread: 5,
            monthlyBudgetCents: 500,
            monthlyRepliesLimit: null
        },
        contact: { optOutAt: null, pausedAt: null },
        conversation: {
            status: "OPEN",
            lastIncomingMessageAt: new Date("2026-01-01T12:00:00Z"),
            aiPausedAt: null
        },
        humanRepliedAfter: false,
        reply: {
            body: "Abrimos de 9:00 a 18:00.",
            confidence: 0.9,
            handoff: false
        },
        knowledgeEntriesUsed: 1,
        usage: {
            repliesToday: 0,
            repliesInThread: 0,
            repliesThisMonth: 0,
            spentMicrosThisMonth: 0
        },
        now: new Date("2026-01-01T12:05:00Z"),
        ...overrides
    };
}

describe("decideAutoReply", () => {
    it("envía cuando todo está dentro de la política", () => {
        assert.deepEqual(decideAutoReply(baseInput()), {
            send: true,
            text: "Abrimos de 9:00 a 18:00."
        });
    });

    it("solo aplica en modo automático", () => {
        assert.deepEqual(
            decideAutoReply(
                baseInput({
                    settings: { ...baseInput().settings, mode: "SUGGEST" }
                })
            ),
            { send: false, reason: "MODE_NOT_AUTO" }
        );
    });

    it("respeta la pausa por conversación", () => {
        assert.deepEqual(
            decideAutoReply(
                baseInput({
                    conversation: {
                        ...baseInput().conversation,
                        aiPausedAt: new Date("2026-01-01T11:00:00Z")
                    }
                })
            ),
            { send: false, reason: "CONVERSATION_AI_PAUSED" }
        );
    });

    it("no responde a un contacto dado de baja", () => {
        assert.deepEqual(
            decideAutoReply(
                baseInput({
                    contact: {
                        optOutAt: new Date("2026-01-01T00:00:00Z"),
                        pausedAt: null
                    }
                })
            ),
            { send: false, reason: "CONTACT_OPTED_OUT" }
        );
    });

    it("no responde fuera de la ventana de 24 horas", () => {
        assert.deepEqual(
            decideAutoReply(
                baseInput({
                    conversation: {
                        ...baseInput().conversation,
                        lastIncomingMessageAt: new Date(
                            "2025-12-30T12:00:00Z"
                        )
                    }
                })
            ),
            { send: false, reason: "WINDOW_CLOSED" }
        );
    });

    it("no responde si una persona ya contestó", () => {
        assert.deepEqual(
            decideAutoReply(baseInput({ humanRepliedAfter: true })),
            { send: false, reason: "HUMAN_REPLIED" }
        );
    });

    it("entrega cuando el modelo pide handoff", () => {
        assert.deepEqual(
            decideAutoReply(
                baseInput({
                    reply: { ...baseInput().reply, handoff: true }
                })
            ),
            { send: false, reason: "HANDOFF_REQUIRED" }
        );
    });

    it("entrega por debajo de la confianza mínima", () => {
        assert.deepEqual(
            decideAutoReply(
                baseInput({
                    reply: { ...baseInput().reply, confidence: 0.5 }
                })
            ),
            { send: false, reason: "LOW_CONFIDENCE" }
        );
    });

    it("no inventa si no usó conocimiento", () => {
        assert.deepEqual(
            decideAutoReply(baseInput({ knowledgeEntriesUsed: 0 })),
            { send: false, reason: "NO_KNOWLEDGE" }
        );
    });

    it("no envía una respuesta vacía", () => {
        assert.deepEqual(
            decideAutoReply(
                baseInput({
                    reply: { ...baseInput().reply, body: "   " }
                })
            ),
            { send: false, reason: "EMPTY_REPLY" }
        );
    });

    it("respeta el límite diario", () => {
        assert.deepEqual(
            decideAutoReply(
                baseInput({
                    usage: {
                        ...baseInput().usage,
                        repliesToday: 50
                    }
                })
            ),
            { send: false, reason: "DAILY_LIMIT" }
        );
    });

    it("respeta el límite por hilo", () => {
        assert.deepEqual(
            decideAutoReply(
                baseInput({
                    usage: {
                        ...baseInput().usage,
                        repliesInThread: 5
                    }
                })
            ),
            { send: false, reason: "THREAD_LIMIT" }
        );
    });

    it("respeta el presupuesto mensual", () => {
        assert.deepEqual(
            decideAutoReply(
                baseInput({
                    usage: {
                        ...baseInput().usage,
                        spentMicrosThisMonth: 5_000_000
                    }
                })
            ),
            { send: false, reason: "BUDGET_EXCEEDED" }
        );
    });

    it("un presupuesto en cero bloquea el automático", () => {
        assert.deepEqual(
            decideAutoReply(
                baseInput({
                    settings: {
                        ...baseInput().settings,
                        monthlyBudgetCents: 0
                    }
                })
            ),
            { send: false, reason: "BUDGET_EXCEEDED" }
        );
    });
});


test("el tope mensual del plan corta el envío automático", () => {
    const input = baseInput();
    input.settings.monthlyRepliesLimit = 1500;
    input.usage.repliesThisMonth = 1500;

    assert.deepEqual(decideAutoReply(input), {
        send: false,
        reason: "MONTHLY_LIMIT"
    });
});

test("sin tope mensual el envío sigue", () => {
    const input = baseInput();
    input.settings.monthlyRepliesLimit = null;
    input.usage.repliesThisMonth = 999999;

    assert.deepEqual(decideAutoReply(input), {
        send: true,
        text: "Abrimos de 9:00 a 18:00."
    });
});
