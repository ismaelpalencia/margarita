import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import {
    AiSuggestionStatus,
    MessageDirection,
    MessageSource,
    MessageStatus,
    MessageType,
    UserRole,
    UserStatus
} from "@prisma/client";
import bcrypt from "bcrypt";

import { prisma } from "../../src/config/prisma";
import { AiAutoReplyService } from "../../src/services/ai/auto-reply.service";
import { MessageService } from "../../src/services/message.service";
import { emailIndex } from "../../src/utils/email";
import { contactPhoneFields } from "../../src/utils/phone";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    expectRejects,
    randomId,
    testPhone,
    WorkspaceFixture
} from "./helpers";

/**
 * Fase 2: control humano y límites del modo automático.
 *
 * No se llama a la Graph API: se prueban las compuertas que corren antes de
 * cualquier envío (pausa, baja, ventana, idempotencia) y los contadores que
 * alimentan la política. El envío real queda cubierto por la política pura en
 * `decision.test.ts`.
 */

let fixture: WorkspaceFixture;

before(async () => {
    fixture = await createWorkspaceFixture();
});

after(async () => {
    await cleanupWorkspace(fixture.workspaceId);
    await disconnectFixtures();
    await prisma.$disconnect();
});

async function createConversation() {
    const contact = await prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(testPhone()),
            customName: "Cliente IA"
        }
    });

    const conversation = await prisma.conversation.create({
        data: {
            workspaceId: fixture.workspaceId,
            contactId: contact.id,
            whatsappNumberId: fixture.numberId,
            source: "INBOUND",
            lastIncomingMessageAt: new Date()
        }
    });

    return { contact, conversation };
}

/**
 * Crea el rastro mínimo de una respuesta automática: mensaje entrante,
 * sugerencia y mensaje saliente enlazado. `aiSuggestionId` es único, así que
 * la idempotencia del envío se apoya en esa relación.
 */
async function createAutoReplyTrace(params: {
    conversationId: string;
    createdAt?: Date;
}) {
    const inbound = await prisma.message.create({
        data: {
            workspaceId: fixture.workspaceId,
            conversationId: params.conversationId,
            direction: MessageDirection.IN,
            type: MessageType.TEXT,
            status: MessageStatus.DELIVERED,
            source: MessageSource.WEBHOOK,
            body: "¿Cuál es el horario?",
            createdAt: params.createdAt
        }
    });

    const suggestion = await prisma.aiSuggestion.create({
        data: {
            workspaceId: fixture.workspaceId,
            conversationId: params.conversationId,
            inboundMessageId: inbound.id,
            body: "Abrimos de 9:00 a 18:00.",
            confidence: 0.93,
            intent: "HORARIO",
            handoff: false,
            model: "deepseek-chat",
            status: AiSuggestionStatus.AUTO_SENT,
            decidedAt: params.createdAt || new Date()
        }
    });

    const outbound = await prisma.message.create({
        data: {
            workspaceId: fixture.workspaceId,
            conversationId: params.conversationId,
            direction: MessageDirection.OUT,
            type: MessageType.TEXT,
            status: MessageStatus.SENT,
            source: MessageSource.AUTOMATIC,
            body: "Abrimos de 9:00 a 18:00.",
            aiSuggestionId: suggestion.id,
            aiModel: "deepseek-chat",
            createdAt: params.createdAt
        }
    });

    return { inbound, suggestion, outbound };
}

test("responder a mano pausa la IA y reactivarla limpia la entrega", async () => {
    const { conversation } = await createConversation();

    await AiAutoReplyService.pauseAfterHumanReply({
        workspaceId: fixture.workspaceId,
        conversationId: conversation.id,
        userId: fixture.adminId
    });

    let stored = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id }
    });

    assert.equal(stored.aiPausedAt !== null, true);
    assert.equal(stored.aiPausedById, fixture.adminId);

    /**
     * Dos clics no reescriben la auditoría: la fecha original se conserva.
     */
    const firstPause = stored.aiPausedAt;

    await AiAutoReplyService.pauseAfterHumanReply({
        workspaceId: fixture.workspaceId,
        conversationId: conversation.id,
        userId: null
    });

    stored = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id }
    });

    assert.equal(stored.aiPausedAt?.getTime(), firstPause?.getTime());

    /** Simula que la IA ya había entregado el hilo a una persona. */
    await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
            aiHandoffAt: new Date(),
            aiHandoffReason: "HANDOFF_REQUIRED"
        }
    });

    const resumed = await AiAutoReplyService.resume({
        workspaceId: fixture.workspaceId,
        conversationId: conversation.id,
        userId: fixture.adminId
    });

    assert.equal(resumed, true);

    stored = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id }
    });

    assert.equal(stored.aiPausedAt, null);
    assert.equal(stored.aiPausedById, null);
    assert.equal(stored.aiHandoffAt, null);
    assert.equal(stored.aiHandoffReason, null);
});

test("los contadores del día suman solo respuestas automáticas y su costo", async () => {
    const { conversation } = await createConversation();

    await createAutoReplyTrace({ conversationId: conversation.id });

    /**
     * Un mensaje manual y uno de campaña no deben contar como respuesta de IA
     * aunque hayan salido hoy y a la misma conversación.
     */
    await prisma.message.create({
        data: {
            workspaceId: fixture.workspaceId,
            conversationId: conversation.id,
            direction: MessageDirection.OUT,
            type: MessageType.TEXT,
            status: MessageStatus.SENT,
            source: MessageSource.MANUAL,
            body: "Te confirmo por aquí.",
            sentByUserId: fixture.adminId
        }
    });

    await prisma.aiUsage.create({
        data: {
            workspaceId: fixture.workspaceId,
            conversationId: conversation.id,
            model: "deepseek-chat",
            promptTokens: 1000,
            completionTokens: 500,
            latencyMs: 900,
            costMicros: 820
        }
    });

    const counters = await AiAutoReplyService.countersFor({
        workspaceId: fixture.workspaceId,
        conversationId: conversation.id
    });

    assert.equal(counters.repliesToday, 1);
    assert.equal(counters.repliesInThread, 1);
    assert.equal(counters.spentMicrosThisMonth, 820);
});

test("el envío automático es idempotente por sugerencia", async () => {
    const { conversation } = await createConversation();
    const trace = await createAutoReplyTrace({
        conversationId: conversation.id
    });

    const message = await MessageService.sendAutomaticReply({
        workspaceId: fixture.workspaceId,
        conversationId: conversation.id,
        body: "Abrimos de 9:00 a 18:00.",
        aiSuggestionId: trace.suggestion.id,
        aiModel: "deepseek-chat"
    });

    assert.equal(message.id, trace.outbound.id);

    /** Un segundo intento devuelve el mismo mensaje y no llama a Meta. */
    const retry = await MessageService.sendAutomaticReply({
        workspaceId: fixture.workspaceId,
        conversationId: conversation.id,
        body: "Abrimos de 9:00 a 18:00.",
        aiSuggestionId: trace.suggestion.id,
        aiModel: "deepseek-chat"
    });

    assert.equal(retry.id, trace.outbound.id);

    const stored = await prisma.message.count({
        where: {
            workspaceId: fixture.workspaceId,
            conversationId: conversation.id,
            aiSuggestionId: trace.suggestion.id
        }
    });

    assert.equal(stored, 1);
});

test("el envío automático se niega con baja o pausa antes de tocar Meta", async () => {
    const { contact, conversation } = await createConversation();

    await prisma.contact.update({
        where: { id: contact.id },
        data: { optOutAt: new Date() }
    });

    await expectRejects(
        () =>
            MessageService.sendAutomaticReply({
                workspaceId: fixture.workspaceId,
                conversationId: conversation.id,
                body: "Hola",
                aiSuggestionId: `sin-envio-${randomId()}`,
                aiModel: null
            }),
        /no admite mensajes/i,
        "un contacto dado de baja no recibe respuesta automática"
    );

    await prisma.contact.update({
        where: { id: contact.id },
        data: { optOutAt: null }
    });

    await AiAutoReplyService.pauseForHuman({
        workspaceId: fixture.workspaceId,
        conversationId: conversation.id,
        userId: fixture.adminId,
        reason: "MANUAL"
    });

    await expectRejects(
        () =>
            MessageService.sendAutomaticReply({
                workspaceId: fixture.workspaceId,
                conversationId: conversation.id,
                body: "Hola",
                aiSuggestionId: `sin-envio-${randomId()}`,
                aiModel: null
            }),
        /en pausa/i,
        "una conversación pausada no recibe respuesta automática"
    );
});

test("la entrega asigna a una persona y deja el motivo", async () => {
    const { conversation } = await createConversation();
    const id = randomId();

    for (const suffix of ["a", "b"]) {
        const email = `prueba-integracion-agente-${id}-${suffix}@ejemplo.mx`;

        await prisma.user.create({
            data: {
                workspaceId: fixture.workspaceId,
                name: `Agente ${suffix}`,
                email,
                emailHash: emailIndex(email),
                password: await bcrypt.hash("ClaveDePrueba123", 4),
                role: UserRole.AGENT,
                status: UserStatus.AVAILABLE,
                isActive: true,
                canSendManualMessages: true
            }
        });
    }

    await AiAutoReplyService.handoff({
        workspaceId: fixture.workspaceId,
        conversationId: conversation.id,
        reason: "HANDOFF_REQUIRED",
        detail: "El cliente pidió hablar con una persona."
    });

    const stored = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id },
        include: { assignedUser: true }
    });

    assert.equal(stored.aiHandoffReason, "HANDOFF_REQUIRED");
    assert.equal(stored.aiHandoffAt !== null, true);
    assert.equal(stored.assignedUser?.role, UserRole.AGENT);
    /** Una entrega por contenido también aparta a la IA del hilo. */
    assert.equal(stored.aiPausedAt !== null, true);
});

test("una entrega por capacidad no deja la IA pausada para siempre", async () => {
    const { conversation } = await createConversation();

    await AiAutoReplyService.handoff({
        workspaceId: fixture.workspaceId,
        conversationId: conversation.id,
        reason: "DAILY_LIMIT",
        pause: false
    });

    const stored = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id }
    });

    assert.equal(stored.aiHandoffReason, "DAILY_LIMIT");
    assert.equal(stored.aiHandoffAt !== null, true);
    assert.equal(stored.aiPausedAt, null);
});
