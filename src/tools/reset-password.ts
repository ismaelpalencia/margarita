import "dotenv/config";

import bcrypt from "bcrypt";
import { PrismaClient, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { generatePassword } from "../utils/team-rules";
import crypto from "node:crypto";

/**
 * Restablece la contraseña de un usuario desde el servidor.
 *
 * Es la salida cuando nadie puede entrar (el administrador olvidó su
 * contraseña y no hay otro admin activo). No hay recuperación por correo a
 * propósito: la herramienta no manda correos, y montar un envío solo para
 * esto agrega un proveedor externo y otra superficie de ataque.
 *
 *   npm run admin:reset-password -- --email=admin@empresa.com
 *   npm run admin:reset-password -- --email=admin@empresa.com --password=OtraClave123
 *
 * Quien la use debe **cambiar la contraseña al entrar**; el sistema se lo
 * exige.
 */

function argValue(name: string): string | null {
    const prefix = `--${name}=`;
    const found = process.argv.find((value) => value.startsWith(prefix));

    return found ? found.slice(prefix.length) : null;
}

async function main() {
    const connectionString = process.env.DATABASE_URL?.trim();

    if (!connectionString) {
        throw new Error("DATABASE_URL no está definido.");
    }

    const email = argValue("email")?.trim().toLowerCase();

    if (!email) {
        throw new Error(
            "Indica el correo: npm run admin:reset-password -- --email=admin@empresa.com"
        );
    }

    const provided = argValue("password");
    const password =
        provided && provided.length > 0
            ? provided
            : generatePassword((index) => crypto.randomBytes(32)[index]);

    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        throw new Error(
            "La contraseña debe tener al menos 10 caracteres, con letras y números."
        );
    }

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString })
    });

    try {
        const user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                name: true,
                role: true,
                isActive: true,
                workspace: { select: { name: true } }
            }
        });

        if (!user) {
            throw new Error(`No existe un usuario con el correo ${email}.`);
        }

        const passwordHash = await bcrypt.hash(password, 12);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: passwordHash,
                mustChangePassword: true,
                failedLoginAttempts: 0,
                lockedUntil: null
            }
        });

        const sessions = await prisma.userSession.updateMany({
            where: { userId: user.id, isActive: true },
            data: { isActive: false }
        });

        await prisma.log.create({
            data: {
                workspaceId: null,
                level: "WARN",
                module: "AUTH",
                action: "PASSWORD_RESET_CLI",
                message:
                    "Se restableció una contraseña desde la consola del servidor.",
                payload: {
                    userId: user.id,
                    email
                } as never
            }
        });

        const isAdmin = user.role === UserRole.ADMIN;

        console.log(`[contraseña] ${user.name} <${email}>`);
        console.log(`[contraseña] Empresa: ${user.workspace.name} · Rol: ${user.role}`);
        console.log(
            `[contraseña] Cuenta ${user.isActive ? "activa" : "INACTIVA (actívala desde el panel o la base)"}.`
        );
        console.log(`[contraseña] Sesiones cerradas: ${sessions.count}`);
        console.log("");
        console.log(`  Contraseña temporal: ${password}`);
        console.log("");
        console.log(
            "[contraseña] Pásala por un medio distinto a la herramienta y cámbiala al entrar."
        );

        if (!isAdmin) {
            console.log(
                "[contraseña] Nota: esta persona no es administradora; solo verá sus conversaciones."
            );
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error(
        "[contraseña] Error:",
        error instanceof Error ? error.message : error
    );

    process.exit(1);
});
