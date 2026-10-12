import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { EncryptedPrismaClient, withEncryption } from "./prisma-encryption";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL no está definido.");
}

const adapter = new PrismaPg({
    connectionString
});

function createClient(): EncryptedPrismaClient {
    return withEncryption(
        new PrismaClient({
            adapter,
            log:
                process.env.NODE_ENV === "development"
                    ? ["query", "error", "warn"]
                    : ["error"]
        })
    ) as EncryptedPrismaClient;
}

const globalForPrisma = globalThis as unknown as {
    prisma?: EncryptedPrismaClient;
};

/**
 * Cliente único de la aplicación, con el cifrado en reposo aplicado.
 * Las credenciales de Meta, los teléfonos, el contenido de los mensajes y
 * la bitácora se cifran al escribir y se descifran al leer.
 */
export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
