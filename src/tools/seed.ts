import "dotenv/config";

import bcrypt from "bcrypt";
import {
    PrismaClient,
    UserRole,
    UserStatus,
    WorkspaceStatus
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { encryptSecret } from "../utils/crypto";

/**
 * Carga inicial: workspace, configuración operativa, el usuario admin y
 * la cuenta de WhatsApp.
 *
 * Se puede ejecutar de dos formas:
 *   - `npm run db:seed` (usa tsx y prisma/seed.ts como envoltorio)
 *   - `node dist/tools/seed.js` (dentro de Railway, sin devDependencies)
 *
 * Es idempotente: volver a correrlo actualiza los mismos registros.
 */

export const REQUIRED_VARIABLES = [
    "WORKSPACE_NAME",
    "WORKSPACE_SLUG",
    "ADMIN_NAME",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
    "META_ACCESS_TOKEN",
    "META_PHONE_NUMBER_ID",
    "META_BUSINESS_ACCOUNT_ID",
    "META_VERIFY_TOKEN",
    "META_PHONE_NUMBER"
] as const;

/**
 * Devuelve todas las variables faltantes de una sola vez, para no
 * descubrirlas una por una.
 */
export function collectMissingVariables(
    env: NodeJS.ProcessEnv = process.env
): string[] {
    return REQUIRED_VARIABLES.filter((name) => {
        const value = env[name];

        return !value || String(value).trim() === "";
    });
}

function optionalText(value: string | undefined): string {
    return value && value.trim() !== "" ? value.trim() : "";
}

function isWeakPassword(password: string): boolean {
    return password.length < 10 || !/\d/.test(password);
}

export async function runSeed() {
    const connectionString = process.env.DATABASE_URL?.trim();

    if (!connectionString) {
        throw new Error("DATABASE_URL no está definido.");
    }

    const missing = collectMissingVariables();

    if (missing.length > 0) {
        throw new Error(
            "Faltan variables de entorno para el seed: " +
                missing.join(", ") +
                ". Configúralas en Railway (o en tu .env) y vuelve a ejecutarlo."
        );
    }

    const workspaceName = String(process.env.WORKSPACE_NAME).trim();
    const workspaceSlug = String(process.env.WORKSPACE_SLUG).trim();
    const adminName = String(process.env.ADMIN_NAME).trim();
    const adminEmail = String(process.env.ADMIN_EMAIL).trim().toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD);
    const metaAccessToken = String(process.env.META_ACCESS_TOKEN).trim();
    const metaPhoneNumberId = String(process.env.META_PHONE_NUMBER_ID).trim();
    const metaBusinessAccountId = String(
        process.env.META_BUSINESS_ACCOUNT_ID
    ).trim();
    const metaVerifyToken = String(process.env.META_VERIFY_TOKEN).trim();
    const metaPhoneNumber = String(process.env.META_PHONE_NUMBER).trim();
    const metaApiVersion = optionalText(process.env.META_API_VERSION) || "v23.0";

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString })
    });

    try {
        console.log("[seed] Creando datos iniciales...");

        const workspace = await prisma.workspace.upsert({
            where: {
                slug: workspaceSlug
            },
            update: {
                name: workspaceName,
                status: WorkspaceStatus.ACTIVE
            },
            create: {
                name: workspaceName,
                slug: workspaceSlug,
                status: WorkspaceStatus.ACTIVE
            }
        });

        await prisma.workspaceSettings.upsert({
            where: {
                workspaceId: workspace.id
            },
            update: {},
            create: {
                workspaceId: workspace.id
            }
        });

        if (isWeakPassword(adminPassword)) {
            console.warn(
                "[seed] Aviso: ADMIN_PASSWORD es débil. Usa al menos 10 caracteres con letras y números."
            );
        }

        const passwordHash = await bcrypt.hash(adminPassword, 12);

        const admin = await prisma.user.upsert({
            where: {
                email: adminEmail
            },
            update: {
                workspaceId: workspace.id,
                name: adminName,
                password: passwordHash,
                role: UserRole.ADMIN,
                isActive: true,
                failedLoginAttempts: 0,
                lockedUntil: null
            },
            create: {
                workspaceId: workspace.id,
                name: adminName,
                email: adminEmail,
                password: passwordHash,
                role: UserRole.ADMIN,
                status: UserStatus.OFFLINE,
                isActive: true,
                canSendManualMessages: true
            }
        });

        const whatsappAccount = await prisma.whatsAppAccount.upsert({
            where: {
                workspaceId: workspace.id
            },
            update: {
                displayName: workspaceName,
                phoneNumber: metaPhoneNumber,
                phoneNumberId: metaPhoneNumberId,
                businessAccountId: metaBusinessAccountId,
                accessToken: encryptSecret(metaAccessToken),
                verifyToken: encryptSecret(metaVerifyToken),
                apiVersion: metaApiVersion
            },
            create: {
                workspaceId: workspace.id,
                displayName: workspaceName,
                phoneNumber: metaPhoneNumber,
                phoneNumberId: metaPhoneNumberId,
                businessAccountId: metaBusinessAccountId,
                accessToken: encryptSecret(metaAccessToken),
                verifyToken: encryptSecret(metaVerifyToken),
                apiVersion: metaApiVersion
            }
        });

        console.log(
            [
                "[seed] Listo.",
                `Workspace: ${workspace.name} (${workspace.slug})`,
                `Admin: ${admin.email}`,
                `WhatsApp: ${whatsappAccount.phoneNumber} · ${whatsappAccount.phoneNumberId}`
            ].join("\n  ")
        );

        return {
            workspaceId: workspace.id,
            adminEmail: admin.email,
            whatsappAccountId: whatsappAccount.id
        };
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    runSeed().catch((error) => {
        console.error(
            "[seed] Error:",
            error instanceof Error ? error.message : error
        );

        process.exit(1);
    });
}
