import crypto from "node:crypto";

import { appConfig } from "../config/app.config";

const PREFIX = "enc:v1:";

let missingKeyWarned = false;

/**
 * La llave se lee en cada operación: así el valor puede venir de .env
 * al arrancar o de una variable inyectada en tiempo de ejecución.
 */
function getEncryptionKey(): string {
    return process.env.ENCRYPTION_KEY ?? appConfig.encryptionKey;
}

function warnMissingKey() {
    if (missingKeyWarned) {
        return;
    }

    missingKeyWarned = true;

    console.warn(
        "[crypto] ENCRYPTION_KEY no está configurada: las credenciales de Meta se guardarán sin cifrar."
    );
}

/**
 * Acepta una llave de 32 bytes en hexadecimal o cualquier cadena,
 * de la que se deriva una llave de 32 bytes con SHA-256.
 */
function deriveKey(secret: string): Buffer {
    if (/^[0-9a-fA-F]{64}$/.test(secret)) {
        return Buffer.from(secret, "hex");
    }

    return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function isEncrypted(value: string | null | undefined): boolean {
    return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
    if (isEncrypted(plain)) {
        return plain;
    }

    const secret = getEncryptionKey();

    if (!secret) {
        warnMissingKey();
        return plain;
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(secret), iv);

    const encrypted = Buffer.concat([
        cipher.update(plain, "utf8"),
        cipher.final()
    ]);

    const tag = cipher.getAuthTag();

    return [
        PREFIX.slice(0, -1),
        iv.toString("base64url"),
        tag.toString("base64url"),
        encrypted.toString("base64url")
    ].join(":");
}

export function decryptSecret(value: string | null | undefined): string {
    if (!value) {
        return "";
    }

    /**
     * Compatibilidad: los valores guardados antes del cifrado se
     * devuelven tal cual para poder migrarlos sin cortar el servicio.
     */
    if (!isEncrypted(value)) {
        return value;
    }

    const secret = getEncryptionKey();

    if (!secret) {
        throw new Error(
            "ENCRYPTION_KEY es necesaria para leer credenciales cifradas."
        );
    }

    const parts = value.split(":");

    if (parts.length !== 5) {
        throw new Error("Credencial cifrada con formato inválido.");
    }

    const [, , ivPart, tagPart, dataPart] = parts;

    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        deriveKey(secret),
        Buffer.from(ivPart, "base64url")
    );

    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

    return Buffer.concat([
        decipher.update(Buffer.from(dataPart, "base64url")),
        decipher.final()
    ]).toString("utf8");
}
