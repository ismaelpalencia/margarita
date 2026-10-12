import assert from "node:assert/strict";
import test from "node:test";

import {
    decryptQueryResult,
    encryptWriteArgs
} from "./prisma-encryption";
import { blindIndex, isEncrypted, isEncryptedJson } from "../utils/crypto";

const TEST_KEY = "clave-de-prueba-para-cifrado-en-reposo-1234567890";

function phoneOf(encrypted: unknown): string {
    assert.equal(typeof encrypted, "string");
    assert.ok(isEncrypted(encrypted as string), "el teléfono debe quedar cifrado");

    return encrypted as string;
}

test("al crear un contacto cifra el teléfono y calcula el índice ciego", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const phone = "5215500000001";
    const args = encryptWriteArgs("Contact", "create", {
        data: { workspaceId: "ws", phone, notes: "cliente frecuente" }
    });

    const data = args.data as Record<string, unknown>;

    phoneOf(data.phone);
    assert.equal(data.phoneHash, blindIndex(phone));
    assert.notEqual(data.phone, phone);
    assert.equal(typeof data.notes, "string");
    assert.ok(isEncrypted(data.notes as string));
});

test("el upsert de contacto cifra solo lo que se crea", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const args = encryptWriteArgs("Contact", "upsert", {
        where: { workspaceId_phoneHash: { workspaceId: "ws", phoneHash: "x" } },
        create: { workspaceId: "ws", phone: "5215500000002" },
        update: { isActive: true }
    });

    const create = args.create as Record<string, unknown>;
    const update = args.update as Record<string, unknown>;

    phoneOf(create.phone);
    assert.equal(create.phoneHash, blindIndex("5215500000002"));
    assert.equal(update.isActive, true);
});

test("cifra el cuerpo del mensaje y sus respuestas de Meta", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const args = encryptWriteArgs("Message", "create", {
        data: {
            body: "Hola, ya está listo tu pedido",
            mimeType: "image/jpeg",
            metaPayload: { from: "5215500000001", type: "text" }
        }
    });

    const data = args.data as Record<string, unknown>;

    assert.ok(isEncrypted(data.body as string));
    assert.equal(data.mimeType, "image/jpeg");
    assert.ok(isEncryptedJson(data.metaPayload));
    assert.equal(
        (data.metaPayload as string).includes("5215500000001"),
        false,
        "el payload no debe exponer el teléfono"
    );
});

test("cifra los destinatarios creados dentro de la campaña", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const args = encryptWriteArgs("Campaign", "create", {
        data: {
            name: "Promo",
            recipients: {
                create: [
                    { contactId: "c1", phone: "5215500000003", variables: ["Ana"] }
                ]
            }
        }
    });

    const data = args.data as {
        recipients: { create: Array<Record<string, unknown>> };
    };
    const recipient = data.recipients.create[0];

    assert.ok(isEncrypted(recipient.phone as string));
    assert.ok(isEncryptedJson(recipient.variables));
});

test("al leer devuelve los valores descifrados, incluso anidados", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const writeArgs = encryptWriteArgs("Message", "create", {
        data: { body: "secreto", metaResponse: { error: { code: 131047 } } }
    });
    const stored = (writeArgs.data as Record<string, unknown>).body as string;
    const storedResponse = (writeArgs.data as Record<string, unknown>)
        .metaResponse as string;

    const createdAt = new Date("2026-10-12T10:00:00.000Z");

    const result = decryptQueryResult({
        id: "m1",
        body: stored,
        metaResponse: storedResponse,
        mimeType: "text/plain",
        createdAt,
        conversation: {
            contact: {
                phone: (
                    encryptWriteArgs("Contact", "create", {
                        data: { phone: "5215500000004" }
                    }).data as Record<string, unknown>
                ).phone
            }
        },
        deletedAt: null
    }) as Record<string, any>;

    assert.equal(result.body, "secreto");
    assert.deepEqual(result.metaResponse, { error: { code: 131047 } });
    assert.equal(result.mimeType, "text/plain");
    assert.equal(result.createdAt, createdAt);
    assert.equal(result.deletedAt, null);
    assert.equal(result.conversation.contact.phone, "5215500000004");
});

test("los datos anteriores al cifrado se siguen leyendo tal cual", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const result = decryptQueryResult({
        body: "mensaje viejo en claro",
        metaResponse: { error: "antiguo" },
        variables: ["Ana"]
    }) as Record<string, unknown>;

    assert.equal(result.body, "mensaje viejo en claro");
    assert.deepEqual(result.metaResponse, { error: "antiguo" });
    assert.deepEqual(result.variables, ["Ana"]);
});

test("cifra el evento crudo del webhook y la bitácora", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const evento = encryptWriteArgs("WebhookEvent", "create", {
        data: {
            phoneNumberId: "884877358043258",
            payload: {
                entry: [
                    {
                        changes: [
                            {
                                value: {
                                    messages: [
                                        { from: "5215548536808", text: { body: "hola" } }
                                    ]
                                }
                            }
                        ]
                    }
                ]
            }
        }
    });

    const payload = (evento.data as Record<string, unknown>).payload as string;

    assert.ok(isEncryptedJson(payload));
    assert.equal(payload.includes("5215548536808"), false);
    assert.equal(payload.includes("hola"), false);

    const leido = decryptQueryResult({ payload }) as Record<string, unknown>;

    assert.equal(
        ((leido.payload as any).entry[0].changes[0].value.messages[0].from),
        "5215548536808"
    );

    const bitacora = encryptWriteArgs("Log", "create", {
        data: { message: "texto de bitácora", payload: { from: "5215548536808" } }
    });

    const log = bitacora.data as Record<string, unknown>;

    assert.ok(isEncryptedJson(log.payload));
    assert.equal(log.message, "texto de bitácora");
});

test("deja intacto el índice ciego que ya viene resuelto", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const args = encryptWriteArgs("Contact", "findUnique", {
        where: { workspaceId_phoneHash: { workspaceId: "ws", phoneHash: "x" } }
    });

    const where = args.where as Record<string, any>;

    assert.deepEqual(where.workspaceId_phoneHash, {
        workspaceId: "ws",
        phoneHash: "x"
    });
});

test("traduce la búsqueda por teléfono al índice ciego", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const compuesta = encryptWriteArgs("Contact", "findFirst", {
        where: {
            workspaceId_phone: { workspaceId: "ws", phone: "5215500000006" }
        }
    }).where as Record<string, any>;

    assert.equal(compuesta.workspaceId_phone, undefined);
    assert.deepEqual(compuesta.workspaceId_phoneHash, {
        workspaceId: "ws",
        phoneHash: blindIndex("5215500000006")
    });

    const translated = encryptWriteArgs("Contact", "findFirst", {
        where: { workspaceId: "ws", phone: "5215500000005" }
    }).where as Record<string, unknown>;

    assert.equal(translated.phoneHash, blindIndex("5215500000005"));
});

test("avisa en claro si alguien intenta buscar el teléfono por partes", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    assert.throws(
        () =>
            encryptWriteArgs("Contact", "findMany", {
                where: { phone: { contains: "555" } }
            }),
        /cifrado/
    );
});
