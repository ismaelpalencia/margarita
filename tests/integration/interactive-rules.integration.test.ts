import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before } from "node:test";

import { ContactOutcomeType, ReplyEffect } from "@prisma/client";

import { appConfig } from "../../src/config/app.config";
import { prisma } from "../../src/config/prisma";
import { runWebhookWorkerOnce } from "../../src/jobs/webhook-worker";
import { InteractiveReplyService } from "../../src/services/interactive-reply.service";
import { contactPhoneFields, normalizeMexicanPhone } from "../../src/utils/phone";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    expectRejects,
    testPhone,
    WorkspaceFixture
} from "./helpers";

/**
 * Fase 3: el puente entre la respuesta de un botón y el resultado de gestión.
 *
 * Lo que se comprueba aquí es lo que no puede fallar en producción:
 *
 * - «Ya pagué» **no** se cuenta como recuperación: entra como pago reportado.
 * - «No reconozco la deuda» pausa la cuenta y no se le vuelve a escribir.
 * - «No quiero ser contactado» da de baja al contacto el mismo día.
 * - Una respuesta sin regla no inventa nada, pero queda dicho que no está mapeada.
 */

let fixture: WorkspaceFixture;

before(async () => {
    fixture = await createWorkspaceFixture();
    await InteractiveReplyService.createRecommended(fixture.workspaceId);
});

after(async () => {
    await cleanupWorkspace(fixture.workspaceId);
    await disconnectFixtures();
    await prisma.$disconnect();
});

function baseUrl(): string {
    return process.env.INTEGRATION_BASE_URL || "http://127.0.0.1:3987";
}

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

    assert.equal(response.status, 200);

    return runWebhookWorkerOnce();
}

/** Toca un botón: es el camino real, firmado, desde Meta. */
async function tap(params: { phone: string; replyId: string; title: string }) {
    const wamid = `wamid.${params.replyId}.${Date.now()}.${Math.random()
        .toString(16)
        .slice(2, 8)}`;

    await deliver({
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
                                { profile: { name: "Cliente Botón" }, wa_id: params.phone }
                            ],
                            messages: [
                                {
                                    from: params.phone,
                                    id: wamid,
                                    timestamp: String(Math.floor(Date.now() / 1000)),
                                    type: "interactive",
                                    interactive: {
                                        type: "button_reply",
                                        button_reply: {
                                            id: params.replyId,
                                            title: params.title
                                        }
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    });

    return wamid;
}

/**
 * Espera a que aparezca un registro de la bitácora. El contacto se actualiza
 * antes que su registro, así que preguntar por el log sin esperar es una
 * carrera con el worker.
 */
async function waitForLog(action: string, level?: "ERROR") {
    const deadline = Date.now() + 5000;

    for (;;) {
        const log = await prisma.log.findFirst({
            where: {
                workspaceId: fixture.workspaceId,
                action,
                ...(level ? { level } : {})
            },
            orderBy: { createdAt: "desc" }
        });

        if (log) {
            return log;
        }

        if (Date.now() > deadline) {
            throw new Error(`No apareció el registro ${action} en la bitácora.`);
        }

        await runWebhookWorkerOnce().catch(() => 0);
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
}

/** Espera a que el contacto tenga el estado esperado (el worker corre aparte). */
async function waitForContact(phone: string, check: (contact: {
    id: string;
    optOutAt: Date | null;
    pausedAt: Date | null;
    pausedReason: string | null;
}) => boolean) {
    const deadline = Date.now() + 5000;
    /**
     * El contacto se guarda con el teléfono **normalizado** (el camino del
     * webhook agrega el `1` de los números mexicanos), así que la búsqueda usa
     * el mismo formato: buscar por el crudo no encontraría nada.
     */
    const phoneFields = contactPhoneFields(normalizeMexicanPhone(phone));

    for (;;) {
        const contact = await prisma.contact.findFirst({
            where: {
                workspaceId: fixture.workspaceId,
                phoneHash: phoneFields.phoneHash
            },
            select: {
                id: true,
                optOutAt: true,
                pausedAt: true,
                pausedReason: true
            }
        });

        if (contact && check(contact)) {
            return contact;
        }

        if (Date.now() > deadline) {
            throw new Error("El contacto no quedó en el estado esperado.");
        }

        await runWebhookWorkerOnce().catch(() => 0);
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
}

test("«Ya pagué» entra como pago reportado, nunca como cobrado", async () => {
    const phone = testPhone();

    await tap({ phone, replyId: "YA_PAGUE", title: "Ya pagué" });

    const contact = await waitForContact(phone, () => true);

    const outcome = await prisma.contactOutcome.findFirstOrThrow({
        where: { contactId: contact.id },
        orderBy: { createdAt: "desc" }
    });

    assert.equal(
        outcome.type,
        ContactOutcomeType.REPORTED_PAYMENT,
        "es un pago reportado, pendiente de conciliar"
    );
    assert.equal(
        outcome.source,
        "INTERACTIVE",
        "queda dicho que lo registró el deudor, no una persona"
    );
    assert.match(
        outcome.note || "",
        /Ya pagué/,
        "y la nota conserva lo que tocó"
    );

    /** Y no se contó como pagado en ningún lado. */
    const paid = await prisma.contactOutcome.count({
        where: { contactId: contact.id, type: ContactOutcomeType.PAID }
    });

    assert.equal(paid, 0, "nadie lo marcó como pagado");
});

test("«no reconozco la deuda» pausa la cuenta y avisa con nivel de error", async () => {
    const phone = testPhone();

    await tap({
        phone,
        replyId: "NO_RECONOZCO",
        title: "No reconozco la deuda"
    });

    const contact = await waitForContact(phone, (row) => Boolean(row.pausedAt));

    assert.ok(contact.pausedAt, "la cuenta queda en pausa");
    assert.match(
        contact.pausedReason || "",
        /reconoce|revis/i,
        "con el motivo escrito para quien la revise"
    );

    const outcome = await prisma.contactOutcome.findFirstOrThrow({
        where: { contactId: contact.id }
    });

    assert.equal(outcome.type, ContactOutcomeType.DISPUTED, "queda en disputa");

    /** El aviso va con nivel de error: es lo que dispara las alertas. */
    const log = await waitForLog("INTERACTIVE_RULE_APPLIED", "ERROR");

    assert.ok(log, "el incidente queda en la bitácora como error");
});

test("«no quiero ser contactado» da de baja al contacto", async () => {
    const phone = testPhone();

    await tap({
        phone,
        replyId: "NO_CONTACTAR",
        title: "No quiero ser contactado"
    });

    const contact = await waitForContact(phone, (row) => Boolean(row.optOutAt));

    assert.ok(contact.optOutAt, "queda dado de baja");

    const stored = await prisma.contact.findUniqueOrThrow({
        where: { id: contact.id },
        select: { optOutSource: true }
    });

    assert.equal(
        stored.optOutSource,
        "button",
        "y se distingue de la baja por palabra clave"
    );
});

test("«quiero que me llame un asesor» deja el resultado para la lista de trabajo", async () => {
    const phone = testPhone();

    await tap({
        phone,
        replyId: "LLAMARME",
        title: "Quiero que me llame un asesor"
    });

    const contact = await waitForContact(phone, () => true);

    const outcome = await prisma.contactOutcome.findFirstOrThrow({
        where: { contactId: contact.id }
    });

    assert.equal(
        outcome.type,
        ContactOutcomeType.CALLBACK,
        "queda como volver a llamar, que es lo que ya usa el equipo"
    );
});

test("una respuesta sin regla no inventa un resultado, pero queda anotada", async () => {
    const phone = testPhone();

    await tap({ phone, replyId: "BOTON_RARO", title: "Algo que no esperábamos" });

    const contact = await waitForContact(phone, () => true);

    const outcomes = await prisma.contactOutcome.count({
        where: { contactId: contact.id }
    });

    assert.equal(outcomes, 0, "sin regla no se registra nada");

    const log = await waitForLog("INTERACTIVE_REPLY_UNMAPPED");

    assert.ok(log, "pero se avisa que esa respuesta no está mapeada");

    const payload = log!.payload as Record<string, unknown>;

    assert.equal(payload.replyId, "BOTON_RARO");
});

test("la misma regla se puede mapear por el texto del botón", async () => {
    const phone = testPhone();

    await InteractiveReplyService.save(fixture.workspaceId, {
        replyId: "ID_DISTINTO",
        replyTitle: "Ver mi estado de cuenta",
        outcomeType: ContactOutcomeType.CALLBACK,
        effect: ReplyEffect.NONE,
        note: "Mapeada por texto"
    });

    /**
     * Meta manda un identificador que no coincide con la regla, pero el texto
     * sí: es la defensa por si el `id` no es confiable.
     */
    await tap({
        phone,
        replyId: "otro_id_cualquiera",
        title: "Ver mi estado de cuenta"
    });

    const contact = await waitForContact(phone, () => true);

    const outcome = await prisma.contactOutcome.findFirstOrThrow({
        where: { contactId: contact.id }
    });

    assert.equal(
        outcome.type,
        ContactOutcomeType.CALLBACK,
        "se encontró la regla por el texto"
    );
});

test("las reglas recomendadas no pisan lo que el despacho editó", async () => {
    const before = await prisma.interactiveReplyRule.findFirstOrThrow({
        where: { workspaceId: fixture.workspaceId, replyId: "YA_PAGUE" }
    });

    await InteractiveReplyService.save(fixture.workspaceId, {
        replyId: "YA_PAGUE",
        replyTitle: "Ya pagué",
        outcomeType: ContactOutcomeType.PROMISE,
        effect: ReplyEffect.NONE,
        note: "Regla propia del despacho"
    });

    await InteractiveReplyService.createRecommended(fixture.workspaceId);

    const after = await prisma.interactiveReplyRule.findFirstOrThrow({
        where: { workspaceId: fixture.workspaceId, replyId: "YA_PAGUE" }
    });

    assert.equal(
        after.outcomeType,
        ContactOutcomeType.PROMISE,
        "la decisión del despacho se respeta"
    );
    assert.equal(
        after.id,
        before.id,
        "y sigue siendo la misma regla (no se duplica)"
    );

    /** Se deja como estaba para no alterar el resto de las pruebas. */
    await InteractiveReplyService.save(fixture.workspaceId, {
        replyId: "YA_PAGUE",
        replyTitle: "Ya pagué",
        outcomeType: ContactOutcomeType.REPORTED_PAYMENT,
        effect: ReplyEffect.NONE,
        note: "Entra como pago reportado"
    });
});

test("el identificador vacío se rechaza con un mensaje claro", async () => {
    await expectRejects(
        () =>
            InteractiveReplyService.save(fixture.workspaceId, {
                replyId: "   ",
                outcomeType: ContactOutcomeType.OTHER
            }),
        /identificador/i,
        "no se puede guardar una regla sin identificador"
    );
});
