import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { encryptSecret, isEncrypted } from "../src/utils/crypto";

/**
 * Cifra las credenciales de Meta que quedaron guardadas en texto plano
 * antes de habilitar ENCRYPTION_KEY. Es idempotente: se puede correr
 * varias veces y solo actúa sobre lo que sigue en claro.
 */
async function main() {
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

    try {
        const accounts = await prisma.whatsAppAccount.findMany();

        let updated = 0;

        for (const account of accounts) {
            const data: { accessToken?: string; verifyToken?: string } = {};

            if (account.accessToken && !isEncrypted(account.accessToken)) {
                data.accessToken = encryptSecret(account.accessToken);
            }

            if (account.verifyToken && !isEncrypted(account.verifyToken)) {
                data.verifyToken = encryptSecret(account.verifyToken);
            }

            if (Object.keys(data).length === 0) {
                continue;
            }

            await prisma.whatsAppAccount.update({
                where: {
                    id: account.id
                },
                data
            });

            updated++;
        }

        console.log(
            `Cifrado completado. Cuentas revisadas: ${accounts.length}. Cuentas actualizadas: ${updated}.`
        );
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error("Error cifrando credenciales:", error);
    process.exit(1);
});
