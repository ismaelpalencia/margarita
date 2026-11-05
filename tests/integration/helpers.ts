import crypto from "node:crypto";

import {
    PrismaClient,
    UserRole,
    UserStatus,
    WorkspaceProfile,
    WorkspaceStatus
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";

import { prisma } from "../../src/config/prisma";
import { encryptSecret } from "../../src/utils/crypto";
import { emailIndex } from "../../src/utils/email";

/**
 * Andamiaje de las pruebas de integración.
 *
 * Regla de oro: cada archivo crea **su propio workspace** y lo borra al
 * terminar. Todo el modelo está colgado del workspace, así que borrarlo se
 * lleva contactos, conversaciones, mensajes, campañas y usuarios. Eso permite
 * correr estas pruebas contra una base de desarrollo sin tocar los datos
 * reales: nunca se toca nada fuera del workspace de prueba.
 *
 * En CI la base es desechable y además se activan las pruebas destructivas
 * (`INTEGRATION_DESTRUCTIVE=1`), que sí necesitan una base vacía.
 */

/** Prefijo obligatorio: es el candado que impide borrar datos reales. */
export const TEST_PREFIX = "prueba-integracion-";

let raw: PrismaClient | null = null;

export function requireDatabase(): string {
    const url = process.env.DATABASE_URL?.trim();

    if (!url) {
        throw new Error(
            "Las pruebas de integración necesitan DATABASE_URL. " +
                "Corre `npm run test:integration` con una base disponible " +
                "(en CI se levanta un PostgreSQL de servicio)."
        );
    }

    return url;
}

/** Cliente sin cifrado: para comprobar cómo quedaron las columnas de verdad. */
export function rawPrisma(): PrismaClient {
    if (!raw) {
        raw = new PrismaClient({
            adapter: new PrismaPg({ connectionString: requireDatabase() })
        });
    }

    return raw;
}

export function randomId(): string {
    return crypto.randomBytes(6).toString("hex");
}

/** Teléfono mexicano único por corrida, para no chocar con datos existentes. */
export function testPhone(): string {
    const suffix = String(Number.parseInt(randomId().slice(0, 6), 16) % 10000000).padStart(
        7,
        "0"
    );

    return `52155${suffix}`;
}

export type WorkspaceFixture = {
    workspaceId: string;
    workspaceName: string;
    adminId: string;
    adminEmail: string;
    adminPassword: string;
    numberId: string;
    phoneNumberId: string;
    accountId: string;
};

/**
 * Crea una instalación de prueba: empresa, configuración, cuenta de WhatsApp
 * con un número y un administrador.
 */
export async function createWorkspaceFixture(options?: {
    /** Las suites del módulo legado de cobranza piden COBRANZA explícitamente. */
    profile?: WorkspaceProfile;
}): Promise<WorkspaceFixture> {
    requireDatabase();

    const id = randomId();
    const adminEmail = `${TEST_PREFIX}${id}@ejemplo.mx`;
    const adminPassword = "ClaveDePrueba123";

    const workspace = await prisma.workspace.create({
        data: {
            name: `Prueba de integración ${id}`,
            slug: `${TEST_PREFIX}${id}`,
            status: WorkspaceStatus.ACTIVE,
            profile: options?.profile ?? WorkspaceProfile.COBRANZA,
            settings: { create: {} }
        }
    });

    const admin = await prisma.user.create({
        data: {
            workspaceId: workspace.id,
            name: "Admin de prueba",
            email: adminEmail,
            emailHash: emailIndex(adminEmail),
            password: await bcrypt.hash(adminPassword, 4),
            role: UserRole.ADMIN,
            status: UserStatus.OFFLINE,
            isActive: true,
            canSendManualMessages: true
        }
    });

    const account = await prisma.whatsAppAccount.create({
        data: {
            workspaceId: workspace.id,
            businessAccountId: `waba-${id}`,
            accessToken: encryptSecret(`token-${id}`),
            verifyToken: encryptSecret(`verify-${id}`),
            apiVersion: "v23.0"
        }
    });

    const phoneNumberId = `pnid-${id}`;

    const number = await prisma.whatsAppNumber.create({
        data: {
            whatsappAccountId: account.id,
            phoneNumberId,
            displayName: "Prueba",
            phoneNumber: "5215500000000",
            isActive: true
        }
    });

    return {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        adminId: admin.id,
        adminEmail,
        adminPassword,
        numberId: number.id,
        phoneNumberId,
        accountId: account.id
    };
}

/**
 * Borra el workspace de prueba y todo lo que cuelga de él.
 *
 * El prefijo se verifica dos veces a propósito: un error de programación en
 * una prueba no puede terminar borrando la empresa real.
 */
export async function cleanupWorkspace(workspaceId: string): Promise<void> {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, slug: true }
    });

    if (!workspace) {
        return;
    }

    if (!workspace.slug.startsWith(TEST_PREFIX)) {
        throw new Error(
            `Se intentó borrar el workspace "${workspace.slug}", que no es de prueba. ` +
                "Las pruebas solo borran lo que ellas crean."
        );
    }

    await prisma.log.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });
}

export async function disconnectFixtures(): Promise<void> {
    if (raw) {
        await raw.$disconnect();
        raw = null;
    }
}

/** Assert helpers que además explican el porqué en el mensaje. */
export function assertEqual<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(
            `${message}: se esperaba ${JSON.stringify(expected)} y llegó ${JSON.stringify(actual)}`
        );
    }
}

export function assertTrue(value: unknown, message: string): void {
    if (!value) {
        throw new Error(message);
    }
}

/** ¿El valor guardado es texto cifrado por la aplicación? */
export function isCiphertext(value: string | null | undefined): boolean {
    return typeof value === "string" && value.startsWith("enc:v1:");
}

/** ¿Es un objeto guardado cifrado dentro de una columna Json? */
export function isEncryptedJson(value: unknown): boolean {
    return typeof value === "string" && value.startsWith("encj:v1:");
}

export async function expectRejects(
    action: () => Promise<unknown>,
    pattern: RegExp,
    message: string
): Promise<void> {
    try {
        await action();
    } catch (error) {
        const text = error instanceof Error ? error.message : String(error);

        if (!pattern.test(text)) {
            throw new Error(`${message}: el error no coincide (${text})`);
        }

        return;
    }

    throw new Error(`${message}: se esperaba un error y no hubo ninguno.`);
}

export function destructiveAllowed(): boolean {
    return process.env.INTEGRATION_DESTRUCTIVE === "1";
}
