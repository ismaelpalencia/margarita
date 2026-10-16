import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { UserRole, WorkspaceStatus } from "@prisma/client";
import bcrypt from "bcrypt";

import { prisma } from "../../src/config/prisma";
import { CampaignService } from "../../src/services/campaign.service";
import { readRecipientTemplateValues } from "../../src/utils/campaign-variables";
import { contactPhoneFields } from "../../src/utils/phone";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    expectRejects,
    testPhone,
    WorkspaceFixture
} from "./helpers";

/**
 * Fase 2b: campañas con encabezado y botón de enlace.
 *
 * Una plantilla de cobranza puede llevar tres cosas con variable: el cuerpo,
 * el encabezado (una, y solo una) y la URL de un botón (una, al final). Aquí se
 * comprueba que la campaña guarda las tres **por destinatario**, que avisa si
 * falta alguna y que se niega a salir con una plantilla que Meta reclasificó
 * como marketing, que es donde el mensaje cuesta varias veces más.
 */

let fixture: WorkspaceFixture;
let templateConBotones: string;
let templateMarketing: string;
let contactId: string;

before(async () => {
    fixture = await createWorkspaceFixture();

    const conBotones = await prisma.template.create({
        data: {
            workspaceId: fixture.workspaceId,
            name: `recordatorio_con_opciones_${Date.now()}`,
            language: "es_MX",
            category: "UTILITY",
            status: "APPROVED",
            components: [
                { type: "HEADER", format: "TEXT", text: "Crédito {{1}}" },
                {
                    type: "BODY",
                    text: "Estimado(a) {{1}}: su saldo es {{2}}."
                },
                {
                    type: "BUTTONS",
                    buttons: [
                        { type: "QUICK_REPLY", text: "Ya pagué" },
                        {
                            type: "URL",
                            text: "Ver mi cuenta",
                            url: "https://ejemplo.mx/cuenta/{{1}}"
                        }
                    ]
                }
            ] as never
        },
        select: { id: true }
    });

    templateConBotones = conBotones.id;

    const marketing = await prisma.template.create({
        data: {
            workspaceId: fixture.workspaceId,
            name: `promo_${Date.now()}`,
            language: "es_MX",
            category: "MARKETING",
            status: "APPROVED",
            components: [
                { type: "BODY", text: "Aprovecha {{1}}" }
            ] as never
        },
        select: { id: true }
    });

    templateMarketing = marketing.id;

    const contact = await prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            customName: "María Fernanda",
            ...contactPhoneFields(testPhone())
        },
        select: { id: true }
    });

    contactId = contact.id;
});

after(async () => {
    await cleanupWorkspace(fixture.workspaceId);
    await disconnectFixtures();
    await prisma.$disconnect();
});

test("la campaña guarda las tres partes por destinatario, con las columnas sustituidas", async () => {
    const campaign = await CampaignService.createCampaign(
        fixture.workspaceId,
        fixture.adminId,
        {
            name: "Recordatorio con opciones",
            templateId: templateConBotones,
            contactIds: [contactId],
            variable1: "Hola {nombre}",
            variable2: "$6,491.77",
            variable3: "",
            headerVariable: "CP-20260001",
            buttonVariable: "{telefono}"
        },
        fixture.numberId
    );

    const recipient = await prisma.campaignRecipient.findFirstOrThrow({
        where: { campaignId: campaign.id }
    });

    const stored = readRecipientTemplateValues(recipient.variables);

    assert.deepEqual(
        stored.body,
        ["Hola María Fernanda", "$6,491.77"],
        "el cuerpo resuelve {nombre}"
    );
    assert.equal(stored.header, "CP-20260001", "el encabezado se guarda tal cual");
    assert.equal(
        stored.button,
        recipient.phone,
        "y al botón le llega el teléfono resuelto"
    );
});

test("sin el encabezado que la plantilla pide, la campaña no se crea", async () => {
    await expectRejects(
        () =>
            CampaignService.createCampaign(
                fixture.workspaceId,
                fixture.adminId,
                {
                    name: "Sin encabezado",
                    templateId: templateConBotones,
                    contactIds: [contactId],
                    variable1: "Hola",
                    variable2: "$100",
                    variable3: "",
                    buttonVariable: "CP-1"
                },
                fixture.numberId
            ),
        /encabezado/,
        "el aviso dice qué falta, no solo que falta algo"
    );
});

test("sin el valor del botón de enlace tampoco", async () => {
    await expectRejects(
        () =>
            CampaignService.createCampaign(
                fixture.workspaceId,
                fixture.adminId,
                {
                    name: "Sin botón",
                    templateId: templateConBotones,
                    contactIds: [contactId],
                    variable1: "Hola",
                    variable2: "$100",
                    variable3: "",
                    headerVariable: "CP-1"
                },
                fixture.numberId
            ),
        /botón de enlace/,
        "y también nombra el botón"
    );
});

test("una plantilla reclasificada como marketing no entra en una campaña", async () => {
    await expectRejects(
        () =>
            CampaignService.createCampaign(
                fixture.workspaceId,
                fixture.adminId,
                {
                    name: "Promoción",
                    templateId: templateMarketing,
                    contactIds: [contactId],
                    variable1: "Hola",
                    variable2: "",
                    variable3: ""
                },
                fixture.numberId
            ),
        /marketing/i,
        "se detiene con el motivo escrito"
    );
});

test("las campañas viejas (solo cuerpo) se siguen leyendo", () => {
    /** El formato anterior guardaba un arreglo; el nuevo, un objeto. */
    assert.deepEqual(readRecipientTemplateValues(["Hola", "$100"]), {
        body: ["Hola", "$100"],
        header: "",
        button: ""
    });

    assert.deepEqual(
        readRecipientTemplateValues({ body: ["Hola"], header: "CP-1", button: "CP-1" }),
        { body: ["Hola"], header: "CP-1", button: "CP-1" }
    );

    assert.deepEqual(readRecipientTemplateValues(null), {
        body: [],
        header: "",
        button: ""
    });
});

/**
 * Un contacto sin nombre haría que {nombre} quedara vacío: la campaña lo avisa
 * antes de crearse, en lugar de mandar un saludo a medias.
 */
test("si una variable se queda vacía por falta de dato, se avisa", async () => {
    const sinNombre = await prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(testPhone())
        },
        select: { id: true }
    });

    await expectRejects(
        () =>
            CampaignService.createCampaign(
                fixture.workspaceId,
                fixture.adminId,
                {
                    name: "Sin nombre",
                    templateId: templateConBotones,
                    contactIds: [sinNombre.id],
                    /** Solo la referencia: si el contacto no tiene nombre, el valor queda vacío. */
                    variable1: "{nombre}",
                    variable2: "$100",
                    variable3: "",
                    headerVariable: "CP-1",
                    buttonVariable: "CP-1"
                },
                fixture.numberId
            ),
        /quedaron sin el dato|sin nombre/i,
        "el contacto no tiene nombre registrado"
    );
});
