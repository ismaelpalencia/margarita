import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import test, { after, before } from "node:test";

import { WorkspaceProfile, WorkspaceStatus } from "@prisma/client";

import { prisma } from "../../src/config/prisma";
import { LeadService } from "../../src/services/lead.service";
import { contactPhoneFields } from "../../src/utils/phone";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    randomId,
    rawPrisma,
    testPhone,
    WorkspaceFixture
} from "./helpers";

const SECRET = "secreto-de-firma-de-prueba";

let fixture: WorkspaceFixture;
let otherWorkspaceId: string | null = null;
let mock: http.Server;
let mockPort = 0;
let requests: Array<{ signature: string | undefined; idempotency: string | undefined; body: string }> = [];

before(async () => {
    fixture = await createWorkspaceFixture();

    mock = http.createServer((req, res) => {
        let data = "";

        req.on("data", (chunk) => { data += chunk; });
        req.on("end", () => {
            requests.push({
                signature: req.headers["x-margarita-signature"] as string | undefined,
                idempotency: req.headers["x-idempotency-key"] as string | undefined,
                body: data
            });
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
        });
    });

    await new Promise<void>((resolve) => {
        mock.listen(0, "127.0.0.1", () => {
            const address = mock.address();

            if (address && typeof address === "object") {
                mockPort = address.port;
            }

            resolve();
        });
    });
});

after(async () => {
    await new Promise<void>((resolve) => mock.close(() => resolve()));
    await cleanupWorkspace(fixture.workspaceId);

    if (otherWorkspaceId) {
        await prisma.workspace.delete({ where: { id: otherWorkspaceId } }).catch(() => undefined);
    }

    await disconnectFixtures();
    await prisma.$disconnect();
});

async function createConversation() {
    const contact = await prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(testPhone()),
            customName: "Cliente Lead"
        }
    });

    const conversation = await prisma.conversation.create({
        data: {
            workspaceId: fixture.workspaceId,
            contactId: contact.id,
            whatsappNumberId: fixture.numberId,
            source: "INBOUND"
        }
    });

    return { contact, conversation };
}

test("captura un lead una sola vez, cifrado y con webhook firmado", async () => {
    await prisma.workspace.update({
        where: { id: fixture.workspaceId },
        data: {
            leadsEnabled: true,
            leadWebhookUrl: "http://127.0.0.1:" + mockPort + "/leads",
            leadWebhookSecret: SECRET
        }
    });

    const { contact, conversation } = await createConversation();
    const email = "ana." + randomId() + "@empresa.mx";

    const first = await LeadService.capture({
        workspaceId: fixture.workspaceId,
        contactId: contact.id,
        conversationId: conversation.id,
        name: "Ana López",
        email,
        interest: "Cotización de servicio",
        source: "INBOUND"
    });

    assert.equal(first.created, true);

    const second = await LeadService.capture({
        workspaceId: fixture.workspaceId,
        contactId: contact.id,
        conversationId: conversation.id,
        name: "Ana López",
        email,
        interest: "Cotización de servicio",
        source: "INBOUND"
    });

    assert.equal(second.created, false, "la misma conversación + correo no duplica");
    assert.equal(second.lead.id, first.lead.id);

    const raw = await rawPrisma().lead.findUniqueOrThrow({
        where: { id: first.lead.id },
        select: { email: true, name: true, emailHash: true }
    });

    assert.ok(raw.email?.startsWith("enc:v1:"), "el correo queda cifrado");
    assert.ok(raw.name?.startsWith("enc:v1:"), "el nombre queda cifrado");
    assert.ok(raw.emailHash, "el correo tiene índice ciego");

    assert.equal(requests.length, 1, "se entregó una sola vez al webhook");

    const sent = requests[0];
    const expected = "sha256=" + crypto.createHmac("sha256", SECRET).update(sent.body, "utf8").digest("hex");

    assert.equal(sent.signature, expected, "el payload va firmado con HMAC-SHA256");
    assert.equal(sent.idempotency, first.lead.id, "la idempotencia es el id del lead");
    assert.match(sent.body, /lead.created/, "el evento es lead.created");
});

test("reintentar reenvía sin duplicar el lead", async () => {
    const lead = await prisma.lead.findFirst({ where: { workspaceId: fixture.workspaceId } });

    assert.ok(lead);

    await LeadService.retry(fixture.workspaceId, lead!.id);

    assert.equal(requests.length, 2, "se reenvió al webhook");
    assert.equal(requests[1].idempotency, lead!.id, "mismo id, no un lead nuevo");

    const count = await prisma.lead.count({ where: { workspaceId: fixture.workspaceId } });

    assert.equal(count, 1, "reintentar no crea otro lead");
});

test("sin webhook configurado no falla nada", async () => {
    await prisma.workspace.update({
        where: { id: fixture.workspaceId },
        data: { leadWebhookUrl: null }
    });

    const { contact, conversation } = await createConversation();
    const before = requests.length;

    const result = await LeadService.capture({
        workspaceId: fixture.workspaceId,
        contactId: contact.id,
        conversationId: conversation.id,
        name: "Sin webhook",
        email: "sin-webhook." + randomId() + "@empresa.mx",
        interest: "Prueba",
        source: "MANUAL"
    });

    assert.equal(result.created, true);
    assert.equal(requests.length, before, "sin URL no se llama al webhook");
});

test("el CSV solo trae los leads del workspace", async () => {
    const other = await prisma.workspace.create({
        data: {
            name: "Otra empresa de leads",
            slug: "otra-leads-" + randomId(),
            profile: WorkspaceProfile.GENERICO,
            status: WorkspaceStatus.ACTIVE
        }
    });

    otherWorkspaceId = other.id;

    await prisma.lead.create({
        data: {
            workspaceId: other.id,
            name: "De otra empresa",
            email: "otra@otra.mx",
            emailHash: "hash-otro",
            source: "MANUAL"
        }
    });

    const csv = await LeadService.exportCsv(fixture.workspaceId);
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n").filter((line) => line.length > 0);

    assert.equal(lines[0].startsWith("id,email,nombre,interes,origen,estado,creado"), true);
    assert.ok(!csv.includes("otra@otra.mx"), "no trae leads de otra empresa");
    assert.match(csv, /sin-webhook|ana\./, "trae los leads de esta empresa");
});