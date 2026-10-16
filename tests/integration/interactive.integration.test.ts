import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";

import { MessageType } from "@prisma/client";

import { appConfig } from "../../src/config/app.config";
import { prisma } from "../../src/config/prisma";
import { runWebhookWorkerOnce } from "../../src/jobs/webhook-worker";
import { isCiphertext, rawPrisma, testPhone } from "./helpers";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    WorkspaceFixture
} from "./helpers";

/**
 * Fase 1 de las interacciones: entender lo que ya llega.
 *
 * Hasta ahora, un toque de botón se guardaba como `[Mensaje interactivo]` y el
 * dato se perdía. Aquí se comprueba el camino completo: payload firmado → cola
 * → worker → mensaje guardado con la opción elegida, con su identificador en
 * claro, su texto cifrado y su registro en la bitácora.
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

/** Envía un payload de webhook firmado y procesa la cola. */
async function deliver(payload: unknown) {
    const body = JSON.stringify(payload);
    const signature =
        "sha256=" +
        crypto
            .createHmac("sha256", appConfig.metaAppSecret)
            .update(body)
            .digest("hex");

    const response = await fetch(`${baseUrl()}/webhooks/meta/whatsapp`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-hub-signature-256": signature
        },
        body
    });

    assert.equal(response.status, 200, "el webhook firmado se acepta");

    const processed = await runWebhookWorkerOnce();

    return processed;
}

/** Payload de un mensaje interactivo entrante. */
function interactivePayload(params: {
    from: string;
    wamid: string;
    interactive: Record<string, unknown>;
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
                                { profile: { name: "Cliente Botón" }, wa_id: params.from }
                            ],
                            messages: [
                                {
                                    from: params.from,
                                    id: params.wamid,
                                    timestamp: String(Math.floor(Date.now() / 1000)),
                                    type: "interactive",
                                    interactive: params.interactive
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    };
}

test("un botón tocado se guarda con la opción que eligió el cliente", async () => {
    const phone = testPhone();
    const wamid = `wamid.boton.${Date.now()}`;

    await deliver(
        interactivePayload({
            from: phone,
            wamid,
            interactive: {
                type: "button_reply",
                button_reply: { id: "YA_PAGUE", title: "Ya pagué" }
            }
        })
    );

    const message = await prisma.message.findUniqueOrThrow({ where: { wamid } });

    assert.equal(message.type, MessageType.INTERACTIVE, "es un interactivo");
    assert.equal(message.replyId, "YA_PAGUE", "el identificador queda en claro");
    assert.equal(message.replyTitle, "Ya pagué", "y el texto se lee tal cual");
    assert.equal(
        message.interactiveType,
        "button_reply",
        "se distingue un botón de una lista"
    );
    assert.equal(
        message.body,
        "Ya pagué",
        "el cuerpo deja de ser «[Mensaje interactivo]»"
    );

    /** En la columna cruda, el texto va cifrado y la llave no. */
    const rows = await rawPrisma().$queryRaw<
        Array<{ replyId: string | null; replyTitle: string | null }>
    >`SELECT "replyId", "replyTitle" FROM "Message" WHERE "wamid" = ${wamid}`;

    assert.ok(rows[0], "la fila existe");
    assert.equal(rows[0]!.replyId, "YA_PAGUE", "el id no se cifra: es una llave");
    assert.ok(
        isCiphertext(rows[0]!.replyTitle),
        "el texto de la opción sí se guarda cifrado"
    );
});

test("elegir de una lista se distingue de tocar un botón", async () => {
    const phone = testPhone();
    const wamid = `wamid.lista.${Date.now()}`;

    await deliver(
        interactivePayload({
            from: phone,
            wamid,
            interactive: {
                type: "list_reply",
                list_reply: {
                    id: "PAGO_PARCIAL",
                    title: "Pago parcial",
                    description: "Abonar una parte y acordar el resto"
                }
            }
        })
    );

    const message = await prisma.message.findUniqueOrThrow({ where: { wamid } });

    assert.equal(message.interactiveType, "list_reply", "es una lista");
    assert.equal(message.replyId, "PAGO_PARCIAL");
    assert.equal(message.replyTitle, "Pago parcial");
});

test("la respuesta queda en la bitácora con su identificador", async () => {
    const phone = testPhone();
    const wamid = `wamid.bitacora.${Date.now()}`;

    await deliver(
        interactivePayload({
            from: phone,
            wamid,
            interactive: {
                type: "button_reply",
                button_reply: { id: "LLAMARME", title: "Quiero que me llamen" }
            }
        })
    );

    const log = await prisma.log.findFirst({
        where: {
            workspaceId: fixture.workspaceId,
            action: "INTERACTIVE_REPLY"
        },
        orderBy: { createdAt: "desc" }
    });

    assert.ok(log, "la respuesta deja registro en la bitácora");

    const payload = log!.payload as Record<string, unknown>;

    assert.equal(payload.replyId, "LLAMARME", "con el identificador de la opción");
});

test("un mensaje interactivo sin opción reconocible no rompe nada", async () => {
    const phone = testPhone();
    const wamid = `wamid.raro.${Date.now()}`;

    await deliver(
        interactivePayload({
            from: phone,
            wamid,
            /** Un interactivo que no trae ni botón ni lista (por ejemplo, un aviso). */
            interactive: { type: "unknown" }
        })
    );

    const message = await prisma.message.findUniqueOrThrow({ where: { wamid } });

    assert.equal(message.type, MessageType.INTERACTIVE);
    assert.equal(message.replyId, null, "sin identificador");
    assert.equal(
        message.body,
        "[Mensaje interactivo]",
        "y se conserva el relleno de siempre"
    );
});
