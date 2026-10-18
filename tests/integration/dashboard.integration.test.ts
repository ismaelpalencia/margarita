import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import {
    ConversationOperationalStatus,
    ConversationStatus,
    MessageDirection,
    MessageSource,
    MessageStatus,
    MessageType
} from "@prisma/client";

import { appConfig } from "../../src/config/app.config";
import { prisma } from "../../src/config/prisma";
import { contactPhoneFields } from "../../src/utils/phone";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    testPhone,
    WorkspaceFixture
} from "./helpers";

/**
 * Un mensaje oculto no reaparece en el dashboard.
 *
 * Era el reporte: se borraba un chat desde el hilo y su último mensaje seguía
 * en «Mensajes entrantes recientes», porque la consulta no filtraba
 * `deletedAt`.
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

function baseUrl(): string {
    return process.env.INTEGRATION_BASE_URL || "http://127.0.0.1:3987";
}

test("el dashboard no muestra mensajes ocultos", async () => {
    const contacto = await prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(testPhone()),
            customName: "Cliente Dashboard"
        }
    });

    const conversacion = await prisma.conversation.create({
        data: {
            workspaceId: fixture.workspaceId,
            contactId: contacto.id,
            whatsappNumberId: fixture.numberId,
            status: ConversationStatus.OPEN,
            operationalStatus: ConversationOperationalStatus.UNASSIGNED,
            source: "INBOUND",
            lastMessageAt: new Date(),
            lastIncomingMessageAt: new Date()
        }
    });

    const base = {
        workspaceId: fixture.workspaceId,
        conversationId: conversacion.id,
        direction: MessageDirection.IN,
        type: MessageType.TEXT,
        status: MessageStatus.DELIVERED,
        source: MessageSource.WEBHOOK
    };

    await prisma.message.create({
        data: { ...base, body: "Mensaje visible en el dashboard" }
    });

    await prisma.message.create({
        data: {
            ...base,
            body: "Mensaje oculto que no debe salir",
            deletedAt: new Date()
        }
    });

    const login = await fetch(`${baseUrl()}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            email: fixture.adminEmail,
            password: fixture.adminPassword
        }).toString()
    });

    const cookie = login.headers
        .getSetCookie()
        .find((value) => value.startsWith(`${appConfig.cookieName}=`));

    assert.ok(cookie, "el admin debe poder entrar");

    const response = await fetch(`${baseUrl()}/admin/dashboard`, {
        headers: { cookie: cookie!.split(";")[0] },
        redirect: "manual"
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Mensaje visible en el dashboard/);
    assert.doesNotMatch(body, /Mensaje oculto que no debe salir/);
});
