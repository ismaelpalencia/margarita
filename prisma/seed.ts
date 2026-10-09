import "dotenv/config";

import bcrypt from "bcrypt";
import {
    PrismaClient,
    UserRole,
    UserStatus,
    WorkspaceStatus
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL no está definido.");
}

const adapter = new PrismaPg({
    connectionString
});

const prisma = new PrismaClient({
    adapter
});

function required(name: string): string {
    const value = process.env[name];

    if (!value || value.trim() === "") {
        throw new Error(`Falta variable de entorno: ${name}`);
    }

    return value.trim();
}

async function main() {
    console.log("Iniciando seed de Margarita...");

    const workspaceName = required("WORKSPACE_NAME");
    const workspaceSlug = required("WORKSPACE_SLUG");

    const adminName = required("ADMIN_NAME");
    const adminEmail = required("ADMIN_EMAIL").toLowerCase();
    const adminPassword = required("ADMIN_PASSWORD");

    const metaAccessToken = required("META_ACCESS_TOKEN");
    const metaPhoneNumberId = required("META_PHONE_NUMBER_ID");
    const metaBusinessAccountId = required("META_BUSINESS_ACCOUNT_ID");
    const metaVerifyToken = required("META_VERIFY_TOKEN");
    const metaPhoneNumber = required("META_PHONE_NUMBER");
    const metaApiVersion = process.env.META_API_VERSION || "v23.0";

    console.log("Variables leídas:");
    console.log({
        workspaceName,
        workspaceSlug,
        adminName,
        adminEmail,
        metaPhoneNumber,
        metaApiVersion
    });

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

    console.log("Workspace listo:", {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug
    });

    const settings = await prisma.workspaceSettings.upsert({
        where: {
            workspaceId: workspace.id
        },
        update: {},
        create: {
            workspaceId: workspace.id
        }
    });

    console.log("WorkspaceSettings listo:", {
        id: settings.id,
        workspaceId: settings.workspaceId
    });

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
            status: UserStatus.OFFLINE,
            isActive: true,
            canSendManualMessages: true
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

    console.log("Admin listo:", {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive
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
            accessToken: metaAccessToken,
            verifyToken: metaVerifyToken,
            apiVersion: metaApiVersion
        },
        create: {
            workspaceId: workspace.id,
            displayName: workspaceName,
            phoneNumber: metaPhoneNumber,
            phoneNumberId: metaPhoneNumberId,
            businessAccountId: metaBusinessAccountId,
            accessToken: metaAccessToken,
            verifyToken: metaVerifyToken,
            apiVersion: metaApiVersion
        }
    });

    console.log("WhatsAppAccount lista:", {
        id: whatsappAccount.id,
        phoneNumber: whatsappAccount.phoneNumber,
        phoneNumberId: whatsappAccount.phoneNumberId,
        apiVersion: whatsappAccount.apiVersion
    });

    const usersCount = await prisma.user.count();

    console.log("Usuarios totales en base de datos:", usersCount);

    console.log("Seed completado correctamente.");
}

main()
    .catch((error) => {
        console.error("Error ejecutando seed:", error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
