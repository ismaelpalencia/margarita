import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { ContactOutcomeType, MessageDirection, MessageStatus, MessageType } from "@prisma/client";

import { prisma } from "../../src/config/prisma";
import { ContactOutcomeService } from "../../src/services/contact-outcome.service";
import { ReportService } from "../../src/services/report.service";
import { SendPolicyService } from "../../src/services/send-policy.service";
import { startOfTodayIn } from "../../src/utils/date";
import { daysOverdue, isOverdue } from "../../src/utils/outcome";
import { contactPhoneFields } from "../../src/utils/phone";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    expectRejects,
    isCiphertext,
    rawPrisma,
    testPhone,
    WorkspaceFixture
} from "./helpers";

/**
 * Resultado de gestión (cobranza): promesa vencida derivada, pago posterior,
 * intentos sin respuesta y marcado en bloque.
 */

let fixture: WorkspaceFixture;
let timezone: string;

before(async () => {
    fixture = await createWorkspaceFixture();
    timezone = await SendPolicyService.timezoneFor(fixture.workspaceId);
});

after(async () => {
    await cleanupWorkspace(fixture.workspaceId);
    await disconnectFixtures();
    await prisma.$disconnect();
});

async function createContact(name: string) {
    return prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(testPhone()),
            customName: name
        },
        select: { id: true }
    });
}

test("una promesa vencida se deduce sola, con su monto cifrado", async () => {
    const contact = await createContact("Cliente Promesa");
    const today = startOfTodayIn(timezone);
    const due = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);

    await ContactOutcomeService.mark({
        workspaceId: fixture.workspaceId,
        contactIds: [contact.id],
        userId: fixture.adminId,
        type: ContactOutcomeType.PROMISE,
        amount: "1,250.50",
        dueDate: due.toISOString().slice(0, 10),
        note: "prometió depositar"
    });

    const stored = await prisma.contact.findUniqueOrThrow({
        where: { id: contact.id },
        select: {
            outcomeType: true,
            outcomeAmount: true,
            outcomeDueAt: true,
            outcomePaidAt: true
        }
    });

    assert.equal(stored.outcomeType, ContactOutcomeType.PROMISE);
    assert.equal(stored.outcomeAmount, "1250.5", "el monto se lee como número");
    assert.equal(
        daysOverdue(stored.outcomeDueAt, today),
        3,
        "la fecha compromiso se guarda a medianoche local"
    );
    assert.ok(
        isOverdue(stored.outcomeType, stored.outcomeDueAt, today),
        "la promesa debe aparecer vencida sin que nadie la marque"
    );

    /** El monto no puede quedar legible en la base. */
    const raw = await rawPrisma().contact.findUniqueOrThrow({
        where: { id: contact.id },
        select: { outcomeAmount: true }
    });

    assert.ok(isCiphertext(raw.outcomeAmount), "el monto va cifrado en la base");

    /** Y la lista de trabajo la muestra arriba, con el monto. */
    const pending = await ReportService.pendingPromises(fixture.workspaceId, today);
    const item = pending.items.find((row) => row.contactId === contact.id);

    assert.ok(item, "la promesa vigente aparece en la lista de trabajo");
    assert.equal(item!.amount, 1250.5);
    assert.equal(item!.daysLate, 3);
});

test("marcar pagado cierra la promesa, aunque haya pagado tarde", async () => {
    const contact = await createContact("Cliente Paga Tarde");
    const today = startOfTodayIn(timezone);
    const due = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

    await ContactOutcomeService.mark({
        workspaceId: fixture.workspaceId,
        contactIds: [contact.id],
        userId: fixture.adminId,
        type: ContactOutcomeType.PROMISE,
        amount: "500",
        dueDate: due.toISOString().slice(0, 10)
    });

    await ContactOutcomeService.mark({
        workspaceId: fixture.workspaceId,
        contactIds: [contact.id],
        userId: fixture.adminId,
        type: ContactOutcomeType.PAID,
        amount: "500",
        paidDate: today.toISOString().slice(0, 10)
    });

    const stored = await prisma.contact.findUniqueOrThrow({
        where: { id: contact.id },
        select: { outcomeType: true, outcomeDueAt: true, outcomePaidAt: true }
    });

    assert.equal(stored.outcomeType, ContactOutcomeType.PAID);
    assert.equal(
        stored.outcomeDueAt,
        null,
        "un pago cierra la promesa: ya no hay nada que vencer"
    );
    assert.ok(stored.outcomePaidAt, "se guarda la fecha en que pagó");

    const pending = await ReportService.pendingPromises(fixture.workspaceId, today);

    assert.equal(
        pending.items.some((row) => row.contactId === contact.id),
        false,
        "una promesa pagada sale de la lista de trabajo"
    );

    const compliance = await ReportService.promiseCompliance({
        workspaceId: fixture.workspaceId,
        from: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
        to: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        fromLabel: "",
        toLabel: ""
    });

    assert.ok(
        compliance.summary.late >= 1,
        "pagada después del compromiso cuenta como tarde"
    );
    assert.equal(
        compliance.items.find((row) => row.contactId === contact.id)?.status,
        "LATE"
    );
});

test("los intentos se cuentan solos y una respuesta los reinicia", async () => {
    const contact = await createContact("Cliente Sin Respuesta");

    const conversation = await prisma.conversation.create({
        data: {
            workspaceId: fixture.workspaceId,
            contactId: contact.id,
            whatsappNumberId: fixture.numberId,
            source: "MANUAL"
        },
        select: { id: true }
    });

    for (let index = 0; index < 3; index += 1) {
        await prisma.message.create({
            data: {
                workspaceId: fixture.workspaceId,
                conversationId: conversation.id,
                direction: MessageDirection.OUT,
                type: MessageType.TEXT,
                status: MessageStatus.SENT,
                source: "MANUAL",
                sentByUserId: fixture.adminId,
                body: `intento ${index + 1}`
            }
        });
    }

    const attempts = await ContactOutcomeService.attemptsFor(
        fixture.workspaceId,
        [contact.id]
    );

    assert.equal(attempts.get(contact.id)?.attempts, 3);
    assert.equal(attempts.get(contact.id)?.hasInbound, false);

    /** Una nota interna no es un intento. */
    await prisma.message.create({
        data: {
            workspaceId: fixture.workspaceId,
            conversationId: conversation.id,
            direction: MessageDirection.OUT,
            type: MessageType.TEXT,
            status: MessageStatus.CREATED,
            source: "MANUAL",
            isInternalNote: true,
            sentByUserId: fixture.adminId,
            body: "nota interna"
        }
    });

    const stillThree = await ContactOutcomeService.attemptsFor(
        fixture.workspaceId,
        [contact.id]
    );

    assert.equal(
        stillThree.get(contact.id)?.attempts,
        3,
        "las notas internas no cuentan como intentos"
    );

    /** El cliente responde: el contador se reinicia. */
    await prisma.message.create({
        data: {
            workspaceId: fixture.workspaceId,
            conversationId: conversation.id,
            direction: MessageDirection.IN,
            type: MessageType.TEXT,
            status: MessageStatus.DELIVERED,
            source: "WEBHOOK",
            body: "ya pagué"
        }
    });

    const reset = await ContactOutcomeService.attemptsFor(
        fixture.workspaceId,
        [contact.id]
    );

    assert.equal(reset.get(contact.id)?.attempts, 0, "responder reinicia los intentos");
    assert.equal(reset.get(contact.id)?.hasInbound, true);
});

test("el marcado en bloque aplica a todos y deja historial", async () => {
    const first = await createContact("Bloque Uno");
    const second = await createContact("Bloque Dos");

    const marked = await ContactOutcomeService.mark({
        workspaceId: fixture.workspaceId,
        contactIds: [first.id, second.id],
        userId: fixture.adminId,
        type: ContactOutcomeType.NO_ANSWER,
        note: "sin respuesta tras varios intentos",
        source: "BULK"
    });

    assert.equal(marked, 2);

    const contacts = await prisma.contact.findMany({
        where: { id: { in: [first.id, second.id] } },
        select: { outcomeType: true }
    });

    assert.ok(
        contacts.every((row) => row.outcomeType === ContactOutcomeType.NO_ANSWER)
    );

    const history = await ContactOutcomeService.historyFor(
        fixture.workspaceId,
        first.id
    );

    assert.equal(history.length, 1);
    assert.equal(history[0].type, ContactOutcomeType.NO_ANSWER);
    assert.equal(history[0].userName, "Admin de prueba", "el historial guarda quién marcó");
    assert.equal(history[0].source, "BULK");
});

test("una promesa sin fecha compromiso se rechaza con un mensaje entendible", async () => {
    const contact = await createContact("Cliente Sin Fecha");

    await expectRejects(
        () =>
            ContactOutcomeService.mark({
                workspaceId: fixture.workspaceId,
                contactIds: [contact.id],
                userId: fixture.adminId,
                type: ContactOutcomeType.PROMISE,
                amount: "100"
            }),
        /fecha compromiso/i,
        "una promesa sin fecha no debe guardarse"
    );
});
