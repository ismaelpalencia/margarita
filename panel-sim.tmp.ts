/**
 * Siembra una empresa de prueba con datos realistas y deja lista una sesión de
 * administrador para revisar el panel (archivo temporal: se borra al terminar).
 */

import fs from "node:fs";

import {
    ContactOutcomeType,
    ConversationOperationalStatus,
    ConversationStatus,
    MessageDirection,
    MessageSource,
    MessageStatus,
    MessageType
} from "@prisma/client";

import { appConfig } from "./src/config/app.config";
import { prisma } from "./src/config/prisma";
import { ContactOutcomeService } from "./src/services/contact-outcome.service";
import { InteractiveReplyService } from "./src/services/interactive-reply.service";
import { contactPhoneFields } from "./src/utils/phone";
import {
    createWorkspaceFixture,
    testPhone
} from "./tests/integration/helpers";

const BASE = process.env.SIM_BASE_URL || "http://127.0.0.1:3995";
const OUT = "/tmp/panel-sim.json";

function buttonPayload(params: {
    phoneNumberId: string;
    from: string;
    name: string;
    text: string;
}) {
    return {
        object: "whatsapp_business_account",
        entry: [
            {
                id: "waba-simulacion",
                changes: [
                    {
                        field: "messages",
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "5215500000000",
                                phone_number_id: params.phoneNumberId
                            },
                            contacts: [
                                { profile: { name: params.name }, wa_id: params.from }
                            ],
                            messages: [
                                {
                                    from: params.from,
                                    id: `wamid.sim.${Date.now()}`,
                                    timestamp: String(Math.floor(Date.now() / 1000)),
                                    type: "button",
                                    button: { text: params.text, payload: params.text }
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    };
}

async function main() {
    const fixture = await createWorkspaceFixture();
    await InteractiveReplyService.createRecommended(fixture.workspaceId);

    /* --- Cliente que pidió llamada (el caso del botón) --- */
    const phoneA = testPhone();
    const nombreA = "María Elena Ruiz";
    const textoBoton = "Quiero que me llame un asesor";

    const clienta = await prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(phoneA),
            customName: nombreA,
            profileName: nombreA,
            optInAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
        }
    });

    await ContactOutcomeService.mark({
        workspaceId: fixture.workspaceId,
        contactIds: [clienta.id],
        userId: null,
        type: ContactOutcomeType.CALLBACK,
        note: `Registrado por el deudor al tocar «${textoBoton}»`,
        source: "INTERACTIVE"
    });

    const conversacion = await prisma.conversation.create({
        data: {
            workspaceId: fixture.workspaceId,
            contactId: clienta.id,
            whatsappNumberId: fixture.numberId,
            status: ConversationStatus.OPEN,
            operationalStatus: ConversationOperationalStatus.UNASSIGNED,
            source: "INBOUND",
            lastMessageAt: new Date(),
            lastIncomingMessageAt: new Date(),
            unreadCount: 1
        }
    });

    await prisma.message.create({
        data: {
            workspaceId: fixture.workspaceId,
            conversationId: conversacion.id,
            direction: MessageDirection.OUT,
            type: MessageType.TEXT,
            status: MessageStatus.READ,
            source: MessageSource.MANUAL,
            sentByUserId: fixture.adminId,
            body:
                "Hola María, le escribimos de Cobranza para recordarle su saldo pendiente de $4,500. ¿Cómo podemos ayudarle?",
            createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000)
        }
    });

    await prisma.message.create({
        data: {
            workspaceId: fixture.workspaceId,
            conversationId: conversacion.id,
            direction: MessageDirection.IN,
            type: MessageType.INTERACTIVE,
            status: MessageStatus.DELIVERED,
            source: MessageSource.WEBHOOK,
            wamid: `wamid.sim.thread.${Date.now()}`,
            body: textoBoton,
            interactiveType: "button",
            replyId: textoBoton,
            replyTitle: textoBoton,
            createdAt: new Date()
        }
    });

    /* --- Promesa vencida y cliente sin contestar --- */
    const clienteB = await prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(testPhone()),
            customName: "Jorge Ramírez",
            profileName: "Jorge Ramírez"
        }
    });

    const vencida = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

    await ContactOutcomeService.mark({
        workspaceId: fixture.workspaceId,
        contactIds: [clienteB.id],
        userId: fixture.adminId,
        type: ContactOutcomeType.PROMISE,
        amount: "4,500.00",
        dueDate: vencida,
        note: "Prometió depositar el viernes."
    });

    const clienteC = await prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(testPhone()),
            customName: "Ana Torres",
            profileName: "Ana Torres"
        }
    });

    await ContactOutcomeService.mark({
        workspaceId: fixture.workspaceId,
        contactIds: [clienteC.id],
        userId: fixture.adminId,
        type: ContactOutcomeType.NO_ANSWER
    });

    /* --- Un webhook guardado, para la pantalla de volcados --- */
    await prisma.webhookEvent.create({
        data: {
            workspaceId: fixture.workspaceId,
            phoneNumberId: fixture.phoneNumberId,
            status: "PROCESSED",
            processedAt: new Date(),
            payload: buttonPayload({
                phoneNumberId: fixture.phoneNumberId,
                from: phoneA,
                name: nombreA,
                text: textoBoton
            })
        }
    });

    /* --- Sesión de administrador para las capturas --- */
    const login = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            email: fixture.adminEmail,
            password: fixture.adminPassword
        }).toString()
    });

    const cookie = login.headers
        .getSetCookie()
        .find((value) => value.startsWith(`${appConfig.cookieName}=`));

    if (!cookie) {
        throw new Error(`el login falló: HTTP ${login.status}`);
    }

    fs.writeFileSync(
        OUT,
        JSON.stringify(
            {
                workspaceId: fixture.workspaceId,
                workspaceSlug: `prueba-integracion-${fixture.workspaceId}`,
                contactA: clienta.id,
                contactB: clienteB.id,
                conversation: conversacion.id,
                cookieName: appConfig.cookieName,
                cookie: cookie.split(";")[0].split("=")[1]
            },
            null,
            2
        )
    );

    console.log("Datos de prueba listos");
    await prisma.$disconnect();
}

main().catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
});
