import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import {
    blindIndex,
    encryptJson,
    encryptSecret,
    isEncrypted,
    isEncryptedJson
} from "../utils/crypto";
import { normalizeMexicanPhone } from "../utils/phone";

/**
 * Cifra los datos que quedaron guardados en claro antes del cifrado en
 * reposo: teléfonos, notas, contenido de mensajes, payloads de Meta,
 * eventos de webhook, variables de campaña, números de la WABA, bitácora
 * y credenciales.
 *
 * Es idempotente: se puede ejecutar varias veces y solo toca lo que sigue
 * en claro. La aplicación no necesita estar detenida; lo único que no debe
 * pasar es que se escriba el mismo registro justo mientras corre.
 *
 *   npm run db:encrypt-data         (en desarrollo, con tsx)
 *   npm run db:encrypt-data:dist    (dentro del contenedor, sin devDependencies)
 *
 * Usa un cliente sin la extensión de cifrado a propósito: necesita ver (y
 * escribir) exactamente lo que hay en la base de datos.
 */

const PAGE_SIZE = 200;

const LEGACY_PHONE_HASH_PREFIX = "legacy:";

type Page<T> = (skip: number, take: number) => Promise<T[]>;

async function forEachPage<T extends { id: string }>(
    load: Page<T>,
    handle: (row: T) => Promise<boolean>
): Promise<{ scanned: number; updated: number }> {
    let offset = 0;
    let scanned = 0;
    let updated = 0;

    for (;;) {
        const rows = await load(offset, PAGE_SIZE);

        for (const row of rows) {
            scanned += 1;

            if (await handle(row)) {
                updated += 1;
            }
        }

        if (rows.length < PAGE_SIZE) {
            break;
        }

        offset += rows.length;
    }

    return { scanned, updated };
}

const ORDER_BY_ID = { id: "asc" as const };

export async function encryptExistingData() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
        throw new Error("DATABASE_URL no está definido.");
    }

    if (!process.env.ENCRYPTION_KEY) {
        throw new Error(
            "ENCRYPTION_KEY no está definida: no hay nada que cifrar. Configúrala primero."
        );
    }

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString })
    });

    const report: string[] = [];

    try {
        const contacts = await forEachPage(
            (skip, take) =>
                prisma.contact.findMany({
                    skip,
                    take,
                    orderBy: ORDER_BY_ID,
                    select: { id: true, phone: true, phoneHash: true, notes: true }
                }),
            async (contact) => {
                const data: {
                    phone?: string;
                    phoneHash?: string;
                    notes?: string;
                } = {};

                if (contact.phone && !isEncrypted(contact.phone)) {
                    let phone = contact.phone;

                    try {
                        phone = normalizeMexicanPhone(contact.phone);
                    } catch {
                        /** Números antiguos con otro formato se dejan igual. */
                    }

                    data.phone = encryptSecret(contact.phone);
                    data.phoneHash = blindIndex(phone);
                } else if (
                    contact.phoneHash?.startsWith(LEGACY_PHONE_HASH_PREFIX)
                ) {
                    let phone = contact.phone;

                    try {
                        phone = normalizeMexicanPhone(contact.phone);
                    } catch {
                        /** Igual que arriba. */
                    }

                    data.phoneHash = blindIndex(phone);
                }

                if (contact.notes && !isEncrypted(contact.notes)) {
                    data.notes = encryptSecret(contact.notes);
                }

                if (Object.keys(data).length === 0) {
                    return false;
                }

                await prisma.contact.update({ where: { id: contact.id }, data });

                return true;
            }
        );

        report.push(
            `Contactos: ${contacts.scanned} revisados, ${contacts.updated} cifrados.`
        );

        const messages = await forEachPage(
            (skip, take) =>
                prisma.message.findMany({
                    skip,
                    take,
                    orderBy: ORDER_BY_ID,
                    select: {
                        id: true,
                        body: true,
                        mediaFilename: true,
                        metaPayload: true,
                        metaResponse: true
                    }
                }),
            async (message) => {
                const data: {
                    body?: string;
                    mediaFilename?: string;
                    metaPayload?: string;
                    metaResponse?: string;
                } = {};

                if (message.body && !isEncrypted(message.body)) {
                    data.body = encryptSecret(message.body);
                }

                if (
                    message.mediaFilename &&
                    !isEncrypted(message.mediaFilename)
                ) {
                    data.mediaFilename = encryptSecret(message.mediaFilename);
                }

                if (message.metaPayload !== null && !isEncryptedJson(message.metaPayload)) {
                    data.metaPayload = encryptJson(message.metaPayload);
                }

                if (
                    message.metaResponse !== null &&
                    !isEncryptedJson(message.metaResponse)
                ) {
                    data.metaResponse = encryptJson(message.metaResponse);
                }

                if (Object.keys(data).length === 0) {
                    return false;
                }

                await prisma.message.update({ where: { id: message.id }, data });

                return true;
            }
        );

        report.push(
            `Mensajes: ${messages.scanned} revisados, ${messages.updated} cifrados.`
        );

        const recipients = await forEachPage(
            (skip, take) =>
                prisma.campaignRecipient.findMany({
                    skip,
                    take,
                    orderBy: ORDER_BY_ID,
                    select: { id: true, phone: true, variables: true }
                }),
            async (recipient) => {
                const data: { phone?: string; variables?: string } = {};

                if (recipient.phone && !isEncrypted(recipient.phone)) {
                    data.phone = encryptSecret(recipient.phone);
                }

                if (
                    recipient.variables !== null &&
                    !isEncryptedJson(recipient.variables)
                ) {
                    data.variables = encryptJson(recipient.variables);
                }

                if (Object.keys(data).length === 0) {
                    return false;
                }

                await prisma.campaignRecipient.update({
                    where: { id: recipient.id },
                    data
                });

                return true;
            }
        );

        report.push(
            `Destinatarios de campaña: ${recipients.scanned} revisados, ${recipients.updated} cifrados.`
        );

        const logs = await forEachPage(
            (skip, take) =>
                prisma.log.findMany({
                    skip,
                    take,
                    orderBy: ORDER_BY_ID,
                    select: { id: true, payload: true }
                }),
            async (log) => {
                if (log.payload === null || isEncryptedJson(log.payload)) {
                    return false;
                }

                await prisma.log.update({
                    where: { id: log.id },
                    data: { payload: encryptJson(log.payload) }
                });

                return true;
            }
        );

        report.push(
            `Bitácora: ${logs.scanned} registros revisados, ${logs.updated} cifrados.`
        );

        const events = await forEachPage(
            (skip, take) =>
                prisma.webhookEvent.findMany({
                    skip,
                    take,
                    orderBy: ORDER_BY_ID,
                    select: { id: true, payload: true }
                }),
            async (event) => {
                if (isEncryptedJson(event.payload)) {
                    return false;
                }

                await prisma.webhookEvent.update({
                    where: { id: event.id },
                    data: { payload: encryptJson(event.payload) }
                });

                return true;
            }
        );

        report.push(
            `Eventos de webhook: ${events.scanned} revisados, ${events.updated} cifrados.`
        );

        const numbers = await forEachPage(
            (skip, take) =>
                prisma.whatsAppNumber.findMany({
                    skip,
                    take,
                    orderBy: ORDER_BY_ID,
                    select: { id: true, phoneNumber: true }
                }),
            async (number) => {
                if (!number.phoneNumber || isEncrypted(number.phoneNumber)) {
                    return false;
                }

                await prisma.whatsAppNumber.update({
                    where: { id: number.id },
                    data: { phoneNumber: encryptSecret(number.phoneNumber) }
                });

                return true;
            }
        );

        report.push(
            `Números de WhatsApp: ${numbers.scanned} revisados, ${numbers.updated} cifrados.`
        );

        const accounts = await forEachPage(
            (skip, take) =>
                prisma.whatsAppAccount.findMany({
                    skip,
                    take,
                    orderBy: ORDER_BY_ID,
                    select: { id: true, accessToken: true, verifyToken: true }
                }),
            async (account) => {
                const data: { accessToken?: string; verifyToken?: string } = {};

                if (account.accessToken && !isEncrypted(account.accessToken)) {
                    data.accessToken = encryptSecret(account.accessToken);
                }

                if (account.verifyToken && !isEncrypted(account.verifyToken)) {
                    data.verifyToken = encryptSecret(account.verifyToken);
                }

                if (Object.keys(data).length === 0) {
                    return false;
                }

                await prisma.whatsAppAccount.update({
                    where: { id: account.id },
                    data
                });

                return true;
            }
        );

        report.push(
            `Credenciales de Meta: ${accounts.scanned} cuentas revisadas, ${accounts.updated} cifradas.`
        );

        console.log("[cifrado] Listo.");

        for (const line of report) {
            console.log(`  ${line}`);
        }
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    encryptExistingData().catch((error) => {
        console.error(
            "[cifrado] Error:",
            error instanceof Error ? error.message : error
        );

        process.exit(1);
    });
}
