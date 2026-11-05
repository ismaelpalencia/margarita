import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import {
    AiJobStatus,
    AiSuggestionStatus,
    FeedbackValue,
    MessageDirection,
    MessageSource,
    MessageStatus,
    MessageType
} from "@prisma/client";

import { prisma } from "../../src/config/prisma";
import { ServiceMetricsService } from "../../src/services/service-metrics.service";
import { contactPhoneFields } from "../../src/utils/phone";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    testPhone,
    WorkspaceFixture
} from "./helpers";

let fixture: WorkspaceFixture;
const now = Date.now();
const base = now - 60 * 60 * 1000;

before(async () => {
    fixture = await createWorkspaceFixture();

    await prisma.workspace.update({
        where: { id: fixture.workspaceId },
        data: { feedbackEnabled: true }
    });
});

after(async () => {
    await cleanupWorkspace(fixture.workspaceId);
    await disconnectFixtures();
    await prisma.$disconnect();
});

async function inbound(conversationId: string, at: number, body: string) {
    return prisma.message.create({
        data: {
            workspaceId: fixture.workspaceId,
            conversationId,
            direction: MessageDirection.IN,
            type: MessageType.TEXT,
            status: MessageStatus.DELIVERED,
            source: MessageSource.WEBHOOK,
            body,
            createdAt: new Date(at)
        }
    });
}

async function outbound(params: {
    conversationId: string;
    at: number;
    source: MessageSource;
    aiSuggestionId?: string;
    body: string;
}) {
    return prisma.message.create({
        data: {
            workspaceId: fixture.workspaceId,
            conversationId: params.conversationId,
            direction: MessageDirection.OUT,
            type: MessageType.TEXT,
            status: MessageStatus.SENT,
            source: params.source,
            aiSuggestionId: params.aiSuggestionId ?? null,
            body: params.body,
            createdAt: new Date(params.at)
        }
    });
}

async function thread(params: {
    autoMinutes?: number;
    manualMinutes?: number;
    intent?: string;
    suggestionStatus?: AiSuggestionStatus;
}) {
    const contact = await prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(testPhone()),
            customName: "Cliente métricas"
        }
    });

    const conversation = await prisma.conversation.create({
        data: {
            workspaceId: fixture.workspaceId,
            contactId: contact.id,
            whatsappNumberId: fixture.numberId,
            source: "INBOUND",
            status: "CLOSED"
        }
    });

    const inboundMessage = await inbound(conversation.id, base, "hola");

    if (params.autoMinutes != null) {
        const suggestion = await prisma.aiSuggestion.create({
            data: {
                workspaceId: fixture.workspaceId,
                conversationId: conversation.id,
                inboundMessageId: inboundMessage.id,
                body: "respuesta IA",
                confidence: 0.9,
                intent: params.intent ?? "horario",
                handoff: false,
                model: "mock",
                status: params.suggestionStatus ?? AiSuggestionStatus.AUTO_SENT
            }
        });

        await outbound({
            conversationId: conversation.id,
            at: base + params.autoMinutes * 60 * 1000,
            source: MessageSource.AUTOMATIC,
            aiSuggestionId: suggestion.id,
            body: "respuesta IA"
        });
    }

    if (params.manualMinutes != null) {
        await outbound({
            conversationId: conversation.id,
            at: base + params.manualMinutes * 60 * 1000,
            source: MessageSource.MANUAL,
            body: "respuesta humana"
        });
    }

    return { contact, conversation, inboundMessage };
}

test("las métricas reconcilian con el dataset", async () => {
    /** A: solo IA, resuelto sin persona. */
    await thread({ autoMinutes: 5, intent: "horario" });

    /** B: solo persona. */
    await thread({ manualMinutes: 15 });

    /** C: IA + persona. */
    await thread({ autoMinutes: 20, manualMinutes: 25, intent: "horario" });

    /** Entrada de KB y una sugerencia HANDOFF con la misma intención. */
    await prisma.knowledgeEntry.create({
        data: {
            workspaceId: fixture.workspaceId,
            question: "¿Cuál es el horario?",
            answer: "De 9 a 18.",
            keywords: ["horario"],
            priority: 1
        }
    });

    const handoffThread = await thread({
        autoMinutes: 30,
        intent: "horario",
        suggestionStatus: AiSuggestionStatus.HANDOFF
    });

    /** El handoff sigue abierto: no cuenta como resuelto sin persona. */
    await prisma.conversation.update({
        where: { id: handoffThread.conversation.id },
        data: { status: "OPEN" }
    });

    /** Pregunta sin cobertura. */
    const uncoveredThread = await thread({ manualMinutes: 10 });

    await prisma.aiSuggestionJob.create({
        data: {
            workspaceId: fixture.workspaceId,
            conversationId: uncoveredThread.conversation.id,
            inboundMessageId: uncoveredThread.inboundMessage.id,
            status: AiJobStatus.SKIPPED,
            skipReason: "NO_KNOWLEDGE"
        }
    });

    /** Feedback 👍 en el primer hilo. */
    const firstConversation = await prisma.conversation.findFirst({
        where: { workspaceId: fixture.workspaceId },
        orderBy: { createdAt: "asc" }
    });

    await prisma.conversationFeedback.create({
        data: {
            workspaceId: fixture.workspaceId,
            conversationId: firstConversation!.id,
            value: FeedbackValue.UP
        }
    });

    const metrics = await ServiceMetricsService.summary(
        fixture.workspaceId,
        "America/Mexico_City"
    );

    /** A, C, handoffThread y uncoveredThread tienen IA; B no. */
    assert.equal(metrics.resolution.autoHandled, 3, "A, C y handoff usan IA");
    assert.equal(metrics.resolution.resolvedWithoutHuman, 1, "solo A cierra sin persona");
    assert.equal(metrics.resolution.rate, 1 / 3);

    /** Primera respuesta: A 5, B 15, C 20, handoff 30, uncovered 10. */
    assert.equal(metrics.firstResponse.samples, 5);
    assert.equal(metrics.firstResponse.medianMinutes, 15);
    assert.equal(metrics.firstResponse.p90Minutes, 30);

    const today = metrics.aiHuman[metrics.aiHuman.length - 1];
    assert.ok(today);
    assert.equal(today!.ai, 3, "tres hilos con IA hoy");
    assert.equal(today!.human, 3, "B, C y uncovered tienen persona");
    assert.equal(today!.both, 1, "solo C mezcla IA y persona");

    assert.equal(metrics.uncovered[0]?.question, "hola");
    assert.equal(metrics.uncovered[0]?.count, 1);

    const kb = metrics.kbResolution.find((row) => row.question.includes("horario"));
    assert.ok(kb, "hay métricas para la entrada de horario");
    assert.equal(kb!.matched, 3, "A, C y handoff tienen intención horario");
    assert.equal(kb!.autoSent, 2);

    assert.equal(metrics.feedback.enabled, true);
    assert.equal(metrics.feedback.up, 1);
    assert.equal(metrics.feedback.down, 0);
});