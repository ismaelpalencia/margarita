import assert from "node:assert/strict";
import http from "node:http";
import test, { after, before } from "node:test";

import { MessageDirection, MessageSource } from "@prisma/client";

import { appConfig } from "../../src/config/app.config";
import { prisma } from "../../src/config/prisma";
import { FlowService } from "../../src/services/flow.service";
import { MetaWebhookHandlerService } from "../../src/services/meta-webhook-handler.service";
import { contactPhoneFields } from "../../src/utils/phone";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    testPhone,
    WorkspaceFixture
} from "./helpers";

let fixture: WorkspaceFixture;
let mockGraph: http.Server;
let mockPort = 0;
const originalGraphBaseUrl = appConfig.graphBaseUrl;

before(async () => {
    fixture = await createWorkspaceFixture();

    mockGraph = http.createServer((_req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ messages: [{ id: "wamid.mock.flow." + Date.now() }] }));
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

test("cargar un paquete es idempotente y no pisa lo editado", async () => {
    const pkg = FlowService.readPackage("comercio");
    const flowSlugs = pkg.flows.map((flow) => flow.slug);
    const kbIndexes = pkg.kb.map((_entry, index) => index);

    const first = await FlowService.loadPackage({
        workspaceId: fixture.workspaceId,
        userId: fixture.adminId,
        vertical: "comercio",
        flowSlugs,
        kbIndexes
    });

    assert.equal(first.flowsCreated, pkg.flows.length);
    assert.equal(first.kbCreated, pkg.kb.length);

    const second = await FlowService.loadPackage({
        workspaceId: fixture.workspaceId,
        userId: fixture.adminId,
        vertical: "comercio",
        flowSlugs,
        kbIndexes
    });

    assert.equal(second.flowsCreated, 0, "no se duplican flujos");
    assert.equal(second.flowsSkipped, pkg.flows.length);
    assert.equal(second.kbCreated, 0, "no se duplican entradas");
    assert.equal(second.kbSkipped, pkg.kb.length);

    /** Editar un flujo y volver a cargar no lo pisa. */
    await prisma.flow.update({
        where: { workspaceId_slug: { workspaceId: fixture.workspaceId, slug: "horarios" } },
        data: { reply: "Respuesta editada por el cliente" }
    });

    await FlowService.loadPackage({
        workspaceId: fixture.workspaceId,
        userId: fixture.adminId,
        vertical: "comercio",
        flowSlugs: ["horarios"],
        kbIndexes: []
    });

    const after = await prisma.flow.findUniqueOrThrow({
        where: { workspaceId_slug: { workspaceId: fixture.workspaceId, slug: "horarios" } }
    });

    assert.equal(after.reply, "Respuesta editada por el cliente", "no se pisa la edición");

    const flags = await prisma.workspace.findUniqueOrThrow({
        where: { id: fixture.workspaceId },
        select: { flowsEnabled: true }
    });

    assert.equal(flags.flowsEnabled, true, "cargar enciende el motor");
});

test("un flujo cargado responde de punta a punta", async () => {
    const phone = testPhone();
    const wamid = "wamid.flow." + Date.now();

    await MetaWebhookHandlerService.handleIncomingPayload({
        object: "whatsapp_business_account",
        entry: [
            {
                id: "waba-flow",
                changes: [
                    {
                        field: "messages",
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "5215500000000",
                                phone_number_id: fixture.phoneNumberId
                            },
                            contacts: [{ profile: { name: "Cliente Flujo" }, wa_id: phone }],
                            messages: [
                                {
                                    from: phone,
                                    id: wamid,
                                    timestamp: String(Math.floor(Date.now() / 1000)),
                                    type: "text",
                                    text: { body: "hola" }
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    } as never);

    const reply = await prisma.message.findFirst({
        where: {
            workspaceId: fixture.workspaceId,
            direction: MessageDirection.OUT,
            source: MessageSource.AUTOMATIC
        },
        orderBy: { createdAt: "desc" }
    });

    assert.ok(reply, "el flujo respondió");
    assert.match(reply!.body || "", /Hola/, "responde con el texto del flujo");

    const log = await prisma.log.findFirst({
        where: { workspaceId: fixture.workspaceId, action: "FLOW_TRIGGERED" }
    });

    assert.ok(log, "el disparo queda auditado como FLOW_TRIGGERED");
});