import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { MessageDirection, MessageSource, MessageStatus, MessageType } from "@prisma/client";

import { prisma } from "../../src/config/prisma";
import { blindIndex } from "../../src/utils/crypto";
import { contactPhoneFields } from "../../src/utils/phone";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    expectRejects,
    isCiphertext,
    isEncryptedJson,
    rawPrisma,
    testPhone,
    WorkspaceFixture
} from "./helpers";

/**
 * Cifrado en reposo.
 *
 * Es la prueba que faltaba: se escribe por la aplicación, se mira la columna
 * cruda (debe estar cifrada) y se vuelve a leer por la aplicación (debe
 * llegar en claro). Sin esto, un cambio en la extensión de Prisma podría
 * dejar datos en claro sin que ninguna prueba se queje.
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

test("el contacto guarda teléfono y notas cifrados, y los devuelve en claro", async () => {
    const phone = testPhone();

    const contact = await prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(phone),
            customName: "Cliente Cifrado",
            notes: "nota privada del cliente"
        },
        select: { id: true, phone: true, notes: true, phoneHash: true }
    });

    assert.equal(contact.phone, phone, "la aplicación lee el teléfono en claro");
    assert.equal(contact.notes, "nota privada del cliente");
    assert.equal(
        contact.phoneHash,
        blindIndex(phone),
        "el índice ciego debe permitir buscar por teléfono exacto"
    );

    const raw = await rawPrisma().contact.findUniqueOrThrow({
        where: { id: contact.id },
        select: { phone: true, notes: true, phoneHash: true }
    });

    assert.ok(isCiphertext(raw.phone), "el teléfono debe estar cifrado en la base");
    assert.ok(isCiphertext(raw.notes), "las notas deben estar cifradas");
    assert.ok(
        !raw.phone.includes(phone),
        "el valor crudo no debe contener el teléfono"
    );
    assert.equal(
        raw.phoneHash,
        blindIndex(phone),
        "el índice ciego no se cifra: es lo que se compara"
    );
});

test("el mensaje guarda cuerpo y payload de Meta cifrados", async () => {
    const phone = testPhone();

    const contact = await prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(phone)
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

    const message = await prisma.message.create({
        data: {
            workspaceId: fixture.workspaceId,
            conversationId: conversation.id,
            direction: MessageDirection.IN,
            type: MessageType.TEXT,
            status: MessageStatus.DELIVERED,
            source: MessageSource.WEBHOOK,
            body: "contenido privado del cliente",
            metaPayload: { from: phone, text: "contenido privado del cliente" }
        },
        select: { id: true, body: true, metaPayload: true }
    });

    assert.equal(message.body, "contenido privado del cliente");
    assert.deepEqual(message.metaPayload, {
        from: phone,
        text: "contenido privado del cliente"
    });

    const raw = await rawPrisma().message.findUniqueOrThrow({
        where: { id: message.id },
        select: { body: true, metaPayload: true }
    });

    assert.ok(isCiphertext(raw.body), "el cuerpo debe estar cifrado");
    assert.ok(
        isEncryptedJson(raw.metaPayload),
        "el payload de Meta se guarda como texto cifrado"
    );
    assert.ok(
        !JSON.stringify(raw.metaPayload).includes(phone),
        "el payload no debe exponer el teléfono"
    );
});

test("no se puede filtrar por un campo cifrado: la consulta avisa en lugar de devolver nada", async () => {
    await expectRejects(
        () =>
            prisma.message.findMany({
                where: { body: { contains: "privado" } }
            }),
        /está cifrado|no se puede buscar/i,
        "filtrar por el cuerpo del mensaje debe fallar con explicación"
    );

    await expectRejects(
        () =>
            prisma.contact.findMany({
                where: { phone: { contains: "555" } }
            }),
        /cifrado/i,
        "filtrar por partes del teléfono debe fallar con explicación"
    );
});

test("buscar por teléfono exacto funciona con el índice ciego", async () => {
    const phone = testPhone();

    await prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(phone)
        }
    });

    const found = await prisma.contact.findFirst({
        where: { workspaceId: fixture.workspaceId, phoneHash: blindIndex(phone) },
        select: { id: true }
    });

    assert.ok(found, "el índice ciego permite encontrar por teléfono exacto");
});

test("los datos que ya existían sin cifrar se siguen leyendo", async () => {
    const phone = testPhone();

    /** Se simula una fila anterior al cifrado, escrita directo en la base. */
    const raw = await rawPrisma().contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            phone,
            phoneHash: blindIndex(phone),
            notes: "nota antigua en claro"
        },
        select: { id: true }
    });

    const throughApp = await prisma.contact.findUniqueOrThrow({
        where: { id: raw.id },
        select: { phone: true, notes: true }
    });

    assert.equal(throughApp.phone, phone, "un teléfono viejo se lee tal cual");
    assert.equal(throughApp.notes, "nota antigua en claro");
});
