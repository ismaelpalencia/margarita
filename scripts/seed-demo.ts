/**
 * Datos de demostración para vender.
 *
 *   npm run demo:datos                    # carga en la primera empresa
 *   npm run demo:datos -- --workspace=mi-slug
 *   npm run demo:datos -- --clean         # quita lo que se cargó
 *
 * Todo lo que crea lleva la etiqueta DEMO, así que se puede borrar sin tocar
 * datos reales. Se usa en la demo de 15 minutos del kit comercial.
 */

import {
    ContactOutcomeType,
    ConversationOperationalStatus,
    ConversationStatus,
    MessageDirection,
    MessageSource,
    MessageStatus,
    MessageType
} from "@prisma/client";
import dayjs from "dayjs";

import { prisma } from "../src/config/prisma";
import { ContactOutcomeService } from "../src/services/contact-outcome.service";
import { contactPhoneFields } from "../src/utils/phone";

const args = process.argv.slice(2);
const clean = args.includes("--clean");
const dryRun = args.includes("--dry-run");
const workspaceSlug = args
    .find((arg) => arg.startsWith("--workspace="))
    ?.split("=")[1];

const CLIENTES = [
    ["María Elena Ruiz", ContactOutcomeType.PROMISE, { amount: "4500", days: 4 }],
    ["Jorge Ramírez", ContactOutcomeType.PROMISE, { amount: "12800", days: -1 }],
    ["Ana Torres", ContactOutcomeType.CALLBACK, {}],
    ["Luis Hernández", ContactOutcomeType.CALLBACK, {}],
    ["Sofía Martínez", ContactOutcomeType.NO_ANSWER, {}],
    ["Pedro Sánchez", ContactOutcomeType.NO_ANSWER, {}],
    ["Carla Gómez", ContactOutcomeType.PAID, { amount: "2350", days: 0 }],
    ["Ramiro Díaz", ContactOutcomeType.REPORTED_PAYMENT, {}],
    ["Elena Vargas", ContactOutcomeType.CONVENIO, { amount: "9000", days: 7 }],
    ["Héctor Rojas", ContactOutcomeType.DISPUTED, {}],
    ["Verónica Salas", ContactOutcomeType.NOT_INTERESTED, {}],
    ["Mario Castro", null, {}]
] as const;

function phoneFor(index: number): string {
    return `52155${String(7000000 + index).slice(0, 7)}`;
}

async function main() {
    const workspace = workspaceSlug
        ? await prisma.workspace.findUnique({ where: { slug: workspaceSlug } })
        : await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" } });

    if (!workspace) {
        throw new Error("No hay empresa. Pasa --workspace=<slug>.");
    }

    const admin = await prisma.user.findFirst({
        where: { workspaceId: workspace.id, role: "ADMIN", isActive: true }
    });

    if (!admin) {
        throw new Error("La empresa no tiene administrador activo.");
    }

    const tag = await prisma.tag.upsert({
        where: {
            workspaceId_name: { workspaceId: workspace.id, name: "DEMO" }
        },
        update: {},
        create: { workspaceId: workspace.id, name: "DEMO", color: "#fbbe1f" }
    });

    if (clean) {
        const contacts = await prisma.contact.findMany({
            where: {
                workspaceId: workspace.id,
                tags: { some: { tagId: tag.id } }
            },
            select: { id: true }
        });
        const ids = contacts.map((contact) => contact.id);

        if (ids.length > 0) {
            await prisma.conversation.deleteMany({
                where: { workspaceId: workspace.id, contactId: { in: ids } }
            });
            await prisma.contact.deleteMany({ where: { id: { in: ids } } });
        }

        console.log(`Demo limpiada: ${ids.length} contacto(s).`);
        await prisma.$disconnect();
        return;
    }

    const number = await prisma.whatsAppNumber.findFirst({
        where: { whatsappAccount: { workspaceId: workspace.id } },
        orderBy: { createdAt: "asc" }
    });

    if (!number) {
        throw new Error("La empresa no tiene número de WhatsApp dado de alta.");
    }

    for (const [index, [name, type, extra]] of CLIENTES.entries()) {
        const phone = phoneFor(index);

        if (dryRun) {
            console.log(`(seco) ${name} · ${type || "sin resultado"}`);
            continue;
        }

        const fields = contactPhoneFields(phone);
        const contact = await prisma.contact.upsert({
            where: {
                workspaceId_phoneHash: {
                    workspaceId: workspace.id,
                    phoneHash: fields.phoneHash
                }
            },
            update: { customName: name, isActive: true },
            create: {
                workspaceId: workspace.id,
                ...fields,
                customName: name,
                profileName: name,
                optInAt: new Date()
            }
        });

        await prisma.contactTag.upsert({
            where: {
                contactId_tagId: { contactId: contact.id, tagId: tag.id }
            },
            update: {},
            create: { contactId: contact.id, tagId: tag.id }
        });

        if (type) {
            const dueDate = "days" in extra && extra.days !== undefined
                ? dayjs().add(extra.days, "day").format("YYYY-MM-DD")
                : null;

            await ContactOutcomeService.mark({
                workspaceId: workspace.id,
                contactIds: [contact.id],
                userId: admin.id,
                type,
                amount: "amount" in extra ? extra.amount : null,
                dueDate,
                note: "Dato de demostración"
            });
        }

        /** Dos conversaciones con un toque de botón, para la demo. */
        if (type === ContactOutcomeType.CALLBACK && index === 2) {
            const conversation = await prisma.conversation.upsert({
                where: {
                    whatsappNumberId_contactId: {
                        whatsappNumberId: number.id,
                        contactId: contact.id
                    }
                },
                update: { status: ConversationStatus.OPEN },
                create: {
                    workspaceId: workspace.id,
                    contactId: contact.id,
                    whatsappNumberId: number.id,
                    status: ConversationStatus.OPEN,
                    operationalStatus: ConversationOperationalStatus.UNASSIGNED,
                    source: "INBOUND",
                    lastMessageAt: new Date(),
                    lastIncomingMessageAt: new Date()
                }
            });

            await prisma.message.create({
                data: {
                    workspaceId: workspace.id,
                    conversationId: conversation.id,
                    direction: MessageDirection.IN,
                    type: MessageType.INTERACTIVE,
                    status: MessageStatus.DELIVERED,
                    source: MessageSource.WEBHOOK,
                    body: "Quiero que me llame un asesor",
                    interactiveType: "button",
                    replyId: "LLAMARME",
                    replyTitle: "Quiero que me llame un asesor"
                }
            });
        }
    }

    console.log(
        dryRun
            ? "Simulación terminada: no se escribió nada."
            : `Demo cargada en "${workspace.name}": ${CLIENTES.length} contactos con la etiqueta DEMO.`
    );

    await prisma.$disconnect();
}

main().catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
});
