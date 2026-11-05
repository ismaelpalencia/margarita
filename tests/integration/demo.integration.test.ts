import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { prisma } from "../../src/config/prisma";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    WorkspaceFixture
} from "./helpers";

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

async function countRealTables() {
    const [contacts, conversations, messages, leads] = await Promise.all([
        prisma.contact.count(),
        prisma.conversation.count(),
        prisma.message.count(),
        prisma.lead.count()
    ]);

    return { contacts, conversations, messages, leads };
}

test("la demo responde y no toca las tablas reales", async () => {
    const page = await fetch(`${baseUrl()}/demo`);

    assert.equal(page.status, 200, "la demo está disponible con DEMO_ENABLED");
    assert.match(await page.text(), /Simulador de WhatsApp/);

    const before = await countRealTables();

    const sessionRes = await fetch(`${baseUrl()}/api/demo/session`, { method: "POST" });
    const session = await sessionRes.json();

    assert.ok(session.sessionId);

    const chatRes = await fetch(`${baseUrl()}/api/demo/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: session.sessionId, message: "¿cuál es el horario?", vertical: "comercio" })
    });

    assert.equal(chatRes.status, 200);

    const chat = await chatRes.json();

    assert.ok(chat.reply, "la demo responde con la base de conocimiento");
    assert.equal(chat.mode, "demo");

    const after = await countRealTables();

    assert.deepEqual(after, before, "la demo no escribe en las tablas reales");
});