import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { CampaignStatus } from "@prisma/client";

import { prisma } from "../../src/config/prisma";
import { CampaignService } from "../../src/services/campaign.service";
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
 * Campañas: variables por destinatario, exclusión de contactos dados de baja
 * y cifrado de teléfono y variables en el destinatario.
 */

let fixture: WorkspaceFixture;
let templateId: string;

before(async () => {
    fixture = await createWorkspaceFixture();

    const template = await prisma.template.create({
        data: {
            workspaceId: fixture.workspaceId,
            name: `aviso_pago_${Date.now()}`,
            language: "es_MX",
            status: "APPROVED",
            components: [
                {
                    type: "BODY",
                    text: "Hola {{1}}, tienes un saldo pendiente."
                }
            ] as never
        },
        select: { id: true }
    });

    templateId = template.id;
});

after(async () => {
    await cleanupWorkspace(fixture.workspaceId);
    await disconnectFixtures();
    await prisma.$disconnect();
});

async function createContact(options: { name: string; optedOut?: boolean }) {
    return prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(testPhone()),
            customName: options.name,
            optOutAt: options.optedOut ? new Date() : null,
            optOutSource: options.optedOut ? "keyword" : null
        },
        select: { id: true }
    });
}

test("una campaña resuelve variables, cifra el destinatario y excluye a quien pidió la baja", async () => {
    const reachable = await createContact({ name: "Cliente Activo" });
    const optedOut = await createContact({ name: "Cliente Baja", optedOut: true });

    const campaign = await CampaignService.createCampaign(
        fixture.workspaceId,
        fixture.adminId,
        {
            name: `Campaña de prueba ${Date.now()}`,
            templateId,
            contactIds: [reachable.id, optedOut.id],
            variable1: "{nombre}",
            variable2: "",
            variable3: ""
        },
        fixture.numberId
    );

    assert.equal(campaign.status, CampaignStatus.DRAFT);
    assert.equal(campaign.validRecipients, 1, "solo entra el contacto que puede recibir");
    assert.equal(
        campaign.skippedRecipients,
        1,
        "el contacto dado de baja se cuenta como excluido"
    );

    const recipient = await prisma.campaignRecipient.findFirstOrThrow({
        where: { campaignId: campaign.id },
        select: { id: true, phone: true, variables: true, contactId: true }
    });

    assert.equal(recipient.contactId, reachable.id);
    assert.deepEqual(
        recipient.variables,
        ["Cliente Activo"],
        "la variable {nombre} se resuelve al crear la campaña"
    );

    /** En la base, teléfono y variables van cifrados. */
    const raw = await rawPrisma().campaignRecipient.findUniqueOrThrow({
        where: { id: recipient.id },
        select: { phone: true, variables: true }
    });

    assert.ok(isCiphertext(raw.phone), "el teléfono del destinatario va cifrado");
    assert.ok(isEncryptedJson(raw.variables), "las variables van cifradas");
});

test("una campaña con puros contactos dados de baja no se crea", async () => {
    const optedOut = await createContact({ name: "Solo Baja", optedOut: true });

    await expectRejects(
        () =>
            CampaignService.createCampaign(
                fixture.workspaceId,
                fixture.adminId,
                {
                    name: `Campaña sin nadie ${Date.now()}`,
                    templateId,
                    contactIds: [optedOut.id],
                    variable1: "cliente",
                    variable2: "",
                    variable3: ""
                },
                fixture.numberId
            ),
        /baja/i,
        "sin destinatarios válidos la campaña debe rechazarse"
    );
});

test("el envío en cola exige plantilla aprobada y destinatarios pendientes", async () => {
    const contact = await createContact({ name: "Cliente Cola" });

    const campaign = await CampaignService.createCampaign(
        fixture.workspaceId,
        fixture.adminId,
        {
            name: `Campaña en cola ${Date.now()}`,
            templateId,
            contactIds: [contact.id],
            variable1: "{nombre}",
            variable2: "",
            variable3: ""
        },
        fixture.numberId
    );

    const queued = await CampaignService.startCampaign(
        fixture.workspaceId,
        campaign.id
    );

    assert.equal(queued.pending, 1, "el destinatario queda pendiente en la cola");

    const running = await prisma.campaign.findUniqueOrThrow({
        where: { id: campaign.id },
        select: { status: true }
    });

    assert.equal(
        running.status,
        CampaignStatus.RUNNING,
        "la campaña queda en curso para que el worker la procese"
    );

    /** Pausar detiene el envío sin perder pendientes. */
    await CampaignService.pauseCampaign(fixture.workspaceId, campaign.id);

    const paused = await prisma.campaign.findUniqueOrThrow({
        where: { id: campaign.id },
        select: { status: true }
    });
    const pending = await prisma.campaignRecipient.count({
        where: { campaignId: campaign.id, status: "PENDING" }
    });

    assert.equal(paused.status, CampaignStatus.PAUSED);
    assert.equal(pending, 1, "el pendiente sigue ahí para reanudar");
});
