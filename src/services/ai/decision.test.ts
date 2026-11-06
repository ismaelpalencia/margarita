import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    decideSuggestion,
    SuggestionDecisionInput,
    suggestionSkipLabel
} from "./decision";

function baseInput(
    overrides: Partial<SuggestionDecisionInput> = {}
): SuggestionDecisionInput {
    return {
        globalEnabled: true,
        settings: { enabled: true, mode: "SUGGEST" },
        contact: { optOutAt: null, pausedAt: null },
        conversation: {
            status: "OPEN",
            lastIncomingMessageAt: new Date("2026-01-01T12:00:00Z")
        },
        message: {
            direction: "IN",
            body: "¿Cuál es el horario?",
            replyTitle: null,
            deletedAt: null,
            createdAt: new Date("2026-01-01T12:00:00Z")
        },
        newerInboundExists: false,
        humanRepliedAfter: false,
        now: new Date("2026-01-01T12:05:00Z"),
        ...overrides
    };
}

describe("decideSuggestion", () => {
    it("genera cuando todo está en orden", () => {
        assert.deepEqual(decideSuggestion(baseInput()), {
            generate: true,
            text: "¿Cuál es el horario?"
        });
    });

    it("omite si la instalación tiene la IA apagada", () => {
        assert.deepEqual(
            decideSuggestion(baseInput({ globalEnabled: false })),
            { generate: false, reason: "AI_DISABLED" }
        );
    });

    it("omite si el workspace no la activó", () => {
        assert.deepEqual(
            decideSuggestion(
                baseInput({ settings: { enabled: false, mode: "SUGGEST" } })
            ),
            { generate: false, reason: "WORKSPACE_OFF" }
        );
    });

    it("omite si el número tiene la IA apagada", () => {
        assert.deepEqual(
            decideSuggestion(baseInput({ numberEnabled: false })),
            { generate: false, reason: "NUMBER_AI_DISABLED" }
        );
    });

    it("omite si el modo no es sugerencia", () => {
        assert.deepEqual(
            decideSuggestion(
                baseInput({ settings: { enabled: true, mode: "AUTO" } })
            ),
            { generate: false, reason: "MODE_NOT_SUGGEST" }
        );
    });

    it("nunca responde a un contacto dado de baja", () => {
        assert.deepEqual(
            decideSuggestion(
                baseInput({
                    contact: {
                        optOutAt: new Date("2026-01-01T00:00:00Z"),
                        pausedAt: null
                    }
                })
            ),
            { generate: false, reason: "CONTACT_OPTED_OUT" }
        );
    });

    it("respeta la pausa por revisión", () => {
        assert.deepEqual(
            decideSuggestion(
                baseInput({
                    contact: {
                        optOutAt: null,
                        pausedAt: new Date("2026-01-01T00:00:00Z")
                    }
                })
            ),
            { generate: false, reason: "CONTACT_PAUSED" }
        );
    });

    it("no genera para mensajes salientes", () => {
        assert.deepEqual(
            decideSuggestion(
                baseInput({
                    message: {
                        ...baseInput().message,
                        direction: "OUT"
                    }
                })
            ),
            { generate: false, reason: "MESSAGE_NOT_INBOUND" }
        );
    });

    it("omite mensajes eliminados", () => {
        assert.deepEqual(
            decideSuggestion(
                baseInput({
                    message: {
                        ...baseInput().message,
                        deletedAt: new Date("2026-01-01T12:01:00Z")
                    }
                })
            ),
            { generate: false, reason: "MESSAGE_DELETED" }
        );
    });

    it("omite conversaciones cerradas", () => {
        assert.deepEqual(
            decideSuggestion(
                baseInput({
                    conversation: {
                        status: "CLOSED",
                        lastIncomingMessageAt: new Date(
                            "2026-01-01T12:00:00Z"
                        )
                    }
                })
            ),
            { generate: false, reason: "CONVERSATION_CLOSED" }
        );
    });

    it("usa el título del botón cuando no hay texto", () => {
        const decision = decideSuggestion(
            baseInput({
                message: {
                    ...baseInput().message,
                    body: null,
                    replyTitle: "Quiero información"
                }
            })
        );

        assert.deepEqual(decision, {
            generate: true,
            text: "Quiero información"
        });
    });

    it("omite un mensaje sin contenido", () => {
        assert.deepEqual(
            decideSuggestion(
                baseInput({
                    message: {
                        ...baseInput().message,
                        body: "   ",
                        replyTitle: null
                    }
                })
            ),
            { generate: false, reason: "MESSAGE_EMPTY" }
        );
    });

    it("omite si la ventana de 24 horas está cerrada", () => {
        assert.deepEqual(
            decideSuggestion(
                baseInput({
                    conversation: {
                        status: "OPEN",
                        lastIncomingMessageAt: new Date(
                            "2025-12-30T12:00:00Z"
                        )
                    }
                })
            ),
            { generate: false, reason: "WINDOW_CLOSED" }
        );
    });

    it("omite si llegó un mensaje más nuevo", () => {
        assert.deepEqual(
            decideSuggestion(baseInput({ newerInboundExists: true })),
            { generate: false, reason: "SUPERSEDED" }
        );
    });

    it("omite si una persona ya contestó", () => {
        assert.deepEqual(
            decideSuggestion(baseInput({ humanRepliedAfter: true })),
            { generate: false, reason: "HUMAN_REPLIED" }
        );
    });
});

describe("suggestionSkipLabel", () => {
    it("traduce todos los motivos a una frase para la bitácora", () => {
        const reasons = [
            "AI_DISABLED",
            "WORKSPACE_OFF",
            "MODE_NOT_SUGGEST",
            "MESSAGE_NOT_INBOUND",
            "MESSAGE_DELETED",
            "CONTACT_OPTED_OUT",
            "CONTACT_PAUSED",
            "CONVERSATION_CLOSED",
            "MESSAGE_EMPTY",
            "WINDOW_CLOSED",
            "SUPERSEDED",
            "HUMAN_REPLIED"
        ] as const;

        for (const reason of reasons) {
            assert.equal(typeof suggestionSkipLabel(reason), "string");
            assert.ok(suggestionSkipLabel(reason).length > 0);
        }
    });
});
