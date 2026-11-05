import assert from "node:assert/strict";
import http from "node:http";
import test, { after, before } from "node:test";

import {
    ContactOutcomeType,
    MessageDirection,
    MessageSource,
    MessageStatus,
    MessageType,
    ReplyEffect,
    UserRole
} from "@prisma/client";

import { appConfig } from "../../src/config/app.config";
import { prisma } from "../../src/config/prisma";
import { MessageService } from "../../src/services/message.service";
import { MetaWebhookHandlerService } from "../../src/services/meta-webhook-handler.service";
import { contactPhoneFields } from "../../src/utils/phone";
import { buildInteractiveList } from "../../src/utils/interactive-message";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    testPhone,
    WorkspaceFixture
} from "./helpers";

/**
 * Listas interactivas: envío válido, rechazo por límites antes de Meta y la
 * respuesta de lista dispara la misma regla que un botón.
 */

let fixture: WorkspaceFixture;
let mockGraph: http.Server;
let mockPort = 0;
const originalGraphBaseUrl = appConfig.graphBaseUrl;

before(async () => {
    fixture = await createWorkspaceFixture();

    await prisma.workspace.update({
        where: { id: fixture.workspaceId },
        data: { interactiveListsEnabled: true }
    });

    mockGraph = http.createServer((_req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ messages: [{ id: "wamid.mock.list." + Date.now() }] }));
    });

    await new Promise<void>((resolve) => {
        mockGraph.listen(0, "127.0.0.1", () => {
            const address = mockGraph.address();

            if (address && typeof address === "object") {
                mockPort = address.port;
            }

            resolve();
        });
    });

    appConfig.graphBaseUrl = "http://127.0.0.1:" + mockPort;
});

after(async () => {
    appConfig.graphBaseUrl = originalGraphBaseUrl;
    await new Promise<void>((resolve) => mockGraph.close(() => resolve()));
    await cleanupWorkspace(fixture.workspaceId);
    await disconnectFixtures();
    await prisma.$disconnect();
});

async function createConversation() {
    const contact = await prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(testPhone()),
            customName: "Cliente Lista"
        }
    });

    const conversation = await prisma.conversation.create({
        data: {
            workspaceId: fixture.workspaceId,
            contactId: contact.id,
            whatsappNumberId: fixture.numberId,
            source: "MANUAL",
            lastIncomingMessageAt: new Date()
        }
    });

    return { contact, conversation };
}

test("envía una lista válida por la misma ruta que los botones", async () => {
    const { conversation } = await createConversation();

    const message = await MessageService.sendInteractiveList({
        workspaceId: fixture.workspaceId,
        conversationId: conversation.id,
        userId: fixture.adminId,
        role: UserRole.ADMIN,
        message: buildInteractiveList({
            body: "¿Qué necesitas?",
            buttonLabel: "Ver opciones",
            sectionTitle: "Menú",
            rows: [
                { title: "Horarios", description: "Cuándo abrimos" },
                { title: "Ubicación", description: "Dónde estamos" }
            ]
        })
    });

    assert.equal(message.status, MessageStatus.SENT);
    assert.equal(message.type, MessageType.INTERACTIVE);
    assert.equal(message.interactiveType, "list");
    assert.equal(message.source, MessageSource.MANUAL);

    const payload = message.metaPayload as {
        interactive?: { type?: string; action?: { button?: string } };
    };

    assert.equal(payload.interactive?.type, "list");
    assert.equal(payload.interactive?.action?.button, "Ver opciones");
});

test("rechaza más de 10 opciones antes de llamar a Meta", async () => {
    const { conversation } = await createConversation();

    const before = await prisma.message.count({
        where: { conversationId: conversation.id, direction: MessageDirection.OUT }
    });

    assert.throws(
        () =>
            buildInteractiveList({
                body: "Hola",
                buttonLabel: "Ver",
                rows: Array.from({ length: 11 }, (_, index) => ({
                    title: "Opción " + (index + 1)
                }))
            }),
        /hasta 10 opciones/
    );

    const after = await prisma.message.count({
        where: { conversationId: conversation.id, direction: MessageDirection.OUT }
    });

    assert.equal(after, before, "no se crea ni se manda nada si falla la validación");
});

test("una respuesta de lista dispara la misma regla que un botón", async () => {
    const { contact, conversation } = await createConversation();

    await prisma.interactiveReplyRule.create({
        data: {
            workspaceId: fixture.workspaceId,
            replyId: "HORARIO_ATENCION",
            replyTitle: "Horario de atención",
            outcomeType: ContactOutcomeType.CALLBACK,
            effect: ReplyEffect.NONE,
            isActive: true
        }
    });

    /** Se guarda el mensaje entrante como lo haría el webhook. */
    const inbound = await prisma.message.create({
        data: {
            workspaceId: fixture.workspaceId,
            conversationId: conversation.id,
            direction: MessageDirection.IN,
            type: MessageType.INTERACTIVE,
            status: MessageStatus.DELIVERED,
            source: MessageSource.WEBHOOK,
            wamid: "wamid.list-reply." + Date.now(),
            body: "Horario de atención",
            interactiveType: "list_reply",
            replyId: "HORARIO_ATENCION",
            replyTitle: "Horario de atención"
        }
    });

    const { InteractiveReplyService } = await import(
        "../../src/services/interactive-reply.service"
    );

    const applied = await InteractiveReplyService.apply({
        workspaceId: fixture.workspaceId,
        contactId: contact.id,
        conversationId: conversation.id,
        messageId: inbound.id,
        replyId: "HORARIO_ATENCION",
        replyTitle: "Horario de atención"
    });

    assert.ok(applied, "la regla se aplicó");
    assert.equal(applied!.outcomeType, ContactOutcomeType.CALLBACK);

    const outcome = await prisma.contactOutcome.findFirst({
        where: { contactId: contact.id }
    });

    assert.ok(outcome, "la respuesta de lista registró el resultado");
});
