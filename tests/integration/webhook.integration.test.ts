import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";

import { LogModule, MessageDirection, WebhookEventStatus } from "@prisma/client";

import { appConfig } from "../../src/config/app.config";
import { prisma } from "../../src/config/prisma";
import { runWebhookWorkerOnce } from "../../src/jobs/webhook-worker";
import { MetaWebhookHandlerService } from "../../src/services/meta-webhook-handler.service";
import { blindIndex } from "../../src/utils/crypto";
import { normalizeMexicanPhone } from "../../src/utils/phone";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    rawPrisma,
    testPhone,
    WorkspaceFixture
} from "./helpers";

/**
 * Camino completo del webhook: firma, cola, worker, mensaje guardado y
 * baja automática. Es el flujo que más veces hemos roto sin darnos cuenta.
 */

let fixture: WorkspaceFixture;
const createdWamids: string[] = [];

before(async () => {
    fixture = await createWorkspaceFixture();
});

after(async () => {
    await cleanupWorkspace(fixture.workspaceId);
    await disconnectFixtures();
    await prisma.$disconnect();
});

function textPayload(params: {
    from: string;
    body: string;
    wamid: string;
}) {
    return {
        object: "whatsapp_business_account",
        entry: [
            {
                id: `waba-${fixture.workspaceId}`,
                changes: [
                    {
                        field: "messages",
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "5215500000000",
                                phone_number_id: fixture.phoneNumberId
                            },
                            contacts: [
                                { profile: { name: "Cliente Prueba" }, wa_id: params.from }
                            ],
                            messages: [
                                {
                                    from: params.from,
                                    id: params.wamid,
                                    timestamp: String(Math.floor(Date.now() / 1000)),
                                    type: "text",
                                    text: { body: params.body }
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    };
}

test("la firma del webhook decide: sin firma no entra, con firma sí y queda en cola", async () => {
    const body = JSON.stringify(
        textPayload({
            from: testPhone(),
            body: "mensaje de prueba",
            wamid: `wamid.firma.${Date.now()}`
        })
    );

    const signature =
        "sha256=" +
        crypto
            .createHmac("sha256", appConfig.metaAppSecret)
            .update(body)
            .digest("hex");

    /** Sin firma no se acepta nada. */
    const unsigned = await fetch(`${baseUrl()}/webhooks/meta/whatsapp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body
    });

    assert.equal(unsigned.status, 401, "un webhook sin firma debe rechazarse");

    /** Con firma se acepta y se encola. */
    const signed = await fetch(`${baseUrl()}/webhooks/meta/whatsapp`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-hub-signature-256": signature
        },
        body
    });

    assert.equal(signed.status, 200, "un webhook firmado debe aceptarse");

    const event = await prisma.webhookEvent.findFirst({
        where: { phoneNumberId: fixture.phoneNumberId },
        orderBy: { createdAt: "desc" }
    });

    assert.ok(event, "el evento debe quedar en la cola");
    const acceptable: WebhookEventStatus[] = [
        WebhookEventStatus.PENDING,
        WebhookEventStatus.PROCESSING,
        WebhookEventStatus.PROCESSED
    ];

    assert.ok(
        acceptable.includes(event!.status),
        `el evento quedó en un estado inesperado: ${event!.status}`
    );

    /** El worker lo procesa y el mensaje aparece. */
    for (let attempt = 0; attempt < 5; attempt += 1) {
        if (
            (
                await prisma.webhookEvent.findUnique({
                    where: { id: event!.id },
                    select: { status: true }
                })
            )?.status === WebhookEventStatus.PROCESSED
        ) {
            break;
        }

        await runWebhookWorkerOnce();
    }

    const processed = await prisma.webhookEvent.findUniqueOrThrow({
        where: { id: event!.id },
        select: { status: true, workspaceId: true }
    });

    assert.equal(processed.status, WebhookEventStatus.PROCESSED);
    assert.equal(
        processed.workspaceId,
        fixture.workspaceId,
        "el worker debe resolver a qué empresa pertenece el número"
    );

    const stored = JSON.parse(body);
    const wamid = payloadWamid(stored);

    createdWamids.push(wamid);

    const message = await prisma.message.findUnique({
        where: { wamid },
        select: { body: true, direction: true, workspaceId: true }
    });

    assert.ok(message, "el mensaje debe quedar guardado con su wamid");
    assert.equal(message!.body, "mensaje de prueba");
    assert.equal(message!.direction, MessageDirection.IN);
});

test("el mensaje entrante crea el contacto cifrado, la conversación y suma el no leído", async () => {
    const phone = testPhone();
    const wamid = `wamid.alta.${Date.now()}`;
    const payload = textPayload({ from: phone, body: "hola", wamid });

    createdWamids.push(wamid);

    await MetaWebhookHandlerService.handleIncomingPayload(payload as never);

    const normalized = normalizeMexicanPhone(phone);

    const contact = await prisma.contact.findUnique({
        where: {
            workspaceId_phoneHash: {
                workspaceId: fixture.workspaceId,
                phoneHash: blindIndex(normalized)
            }
        },
        select: { id: true, phone: true, phoneHash: true }
    });

    assert.ok(contact, "el contacto debe existir y ser encontrable por índice ciego");
    assert.equal(contact!.phone, normalized, "el teléfono se lee en claro desde la app");

    /** En la base está cifrado: si no, el cifrado en reposo no sirve de nada. */
    const rawContact = await rawPrisma().contact.findUniqueOrThrow({
        where: { id: contact!.id },
        select: { phone: true }
    });

    assert.ok(
        rawContact.phone.startsWith("enc:v1:"),
        "el teléfono debe quedar cifrado en la base"
    );

    const conversation = await prisma.conversation.findUnique({
        where: {
            whatsappNumberId_contactId: {
                whatsappNumberId: fixture.numberId,
                contactId: contact!.id
            }
        },
        select: { id: true, unreadCount: true }
    });

    assert.ok(conversation, "debe abrirse un hilo para el número y el contacto");
    assert.equal(conversation!.unreadCount, 1, "el mensaje entrante suma un no leído");

    /** Repetir el mismo wamid (Meta reintenta) no duplica nada. */
    await MetaWebhookHandlerService.handleIncomingPayload(payload as never);

    const messages = await prisma.message.count({ where: { wamid } });
    const contacts = await prisma.contact.count({
        where: { workspaceId: fixture.workspaceId, phoneHash: blindIndex(normalized) }
    });

    assert.equal(messages, 1, "el reintento de Meta no debe duplicar el mensaje");
    assert.equal(contacts, 1, "tampoco debe duplicar el contacto");
});

test("escribir STOP da de baja al contacto y lo deja en la bitácora", async () => {
    const phone = testPhone();
    const wamid = `wamid.stop.${Date.now()}`;

    createdWamids.push(wamid);

    await MetaWebhookHandlerService.handleIncomingPayload(
        textPayload({ from: phone, body: "STOP", wamid }) as never
    );

    const contact = await prisma.contact.findUniqueOrThrow({
        where: {
            workspaceId_phoneHash: {
                workspaceId: fixture.workspaceId,
                phoneHash: blindIndex(normalizeMexicanPhone(phone))
            }
        },
        select: { optOutAt: true, optOutSource: true }
    });

    assert.ok(contact.optOutAt, "el contacto debe quedar dado de baja");
    assert.equal(contact.optOutSource, "keyword");

    const log = await prisma.log.findFirst({
        where: {
            workspaceId: fixture.workspaceId,
            action: "CONTACT_OPT_OUT_KEYWORD"
        }
    });

    assert.ok(log, "la baja debe quedar registrada en la bitácora");

    /** Un mensaje que solo menciona la palabra no da de baja a nadie. */
    const otherPhone = testPhone();
    const otherWamid = `wamid.no-stop.${Date.now()}`;

    createdWamids.push(otherWamid);

    await MetaWebhookHandlerService.handleIncomingPayload(
        textPayload({
            from: otherPhone,
            body: "el botón de stop no funciona",
            wamid: otherWamid
        }) as never
    );

    const untouched = await prisma.contact.findUniqueOrThrow({
        where: {
            workspaceId_phoneHash: {
                workspaceId: fixture.workspaceId,
                phoneHash: blindIndex(normalizeMexicanPhone(otherPhone))
            }
        },
        select: { optOutAt: true }
    });

    assert.equal(untouched.optOutAt, null, "una frase que menciona la palabra no da de baja");
});

test("los avisos de Meta quedan en la bitácora con su módulo", async () => {
    const logs = await prisma.log.count({
        where: { workspaceId: fixture.workspaceId, module: LogModule.WEBHOOK }
    });

    assert.ok(logs > 0, "el procesamiento de webhooks deja rastro en la bitácora");
});

/** El servidor de pruebas lo levanta el script de integración. */
function baseUrl(): string {
    return process.env.INTEGRATION_BASE_URL || "http://127.0.0.1:3987";
}

function payloadWamid(payload: {
    entry: Array<{ changes: Array<{ value: { messages?: Array<{ id: string }> } }> }>;
}): string {
    return payload.entry[0].changes[0].value.messages![0].id;
}
