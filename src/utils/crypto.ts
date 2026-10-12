import crypto from "node:crypto";

import { appConfig } from "../config/app.config";

const PREFIX = "enc:v1:";

/**
 * Prefijo de los objetos que se guardan cifrados dentro de columnas Json.
 * Se distingue del anterior para que, al leer, se sepa que además hay que
 * volver a interpretar el contenido como JSON.
 */
export const JSON_PREFIX = "encj:v1:";

/**
 * Un valor cifrado tiene la forma `enc:v1:<iv>:<tag>:<datos>`.
 *
 * La comparación es estricta a propósito: así un texto escrito por una
 * persona que casualmente empiece con "enc:v1:" no se confunde con un
 * valor cifrado ni provoca que su mensaje se guarde sin cifrar.
 */
const ENCRYPTED_FORMAT = /^enc:v1:[A-Za-z0-9_-]{8,}:[A-Za-z0-9_-]{16,}:[A-Za-z0-9_-]*$/;

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
    return typeof value === "string" && ENCRYPTED_FORMAT.test(value);
}

export function isEncryptedJson(value: unknown): boolean {
    return (
        typeof value === "string" &&
        value.startsWith(JSON_PREFIX) &&
        isEncrypted(value.slice(JSON_PREFIX.length))
    );
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

let decryptFailureWarned = false;

/**
 * Descifra sin lanzar. Se usa donde un valor ilegible no debe tumbar la
 * consulta completa: se devuelve lo que hay y se avisa una sola vez.
 */
export function safeDecryptSecret(value: string | null | undefined): string {
    try {
        return decryptSecret(value);
    } catch (error) {
        if (!decryptFailureWarned) {
            decryptFailureWarned = true;

            console.warn(
                "[crypto] No se pudo descifrar un valor. Revisa que ENCRYPTION_KEY sea la misma con la que se guardó:",
                error instanceof Error ? error.message : error
            );
        }

        return String(value ?? "");
    }
}

/**
 * Índice ciego: el mismo valor produce siempre el mismo resultado, pero
 * no se puede recuperar el original. Sirve para mantener la unicidad y la
 * búsqueda exacta de campos cifrados (por ejemplo el teléfono de un
 * contacto) sin guardarlos en claro.
 *
 * Se usa HMAC con la llave de cifrado, no un hash simple: el espacio de
 * los teléfonos es pequeño y se podría recorrer por fuerza bruta.
 */
export function blindIndex(value: string): string {
    const secret = getEncryptionKey();

    if (!secret) {
        warnMissingKey();

        return crypto.createHash("sha256").update(value, "utf8").digest("hex");
    }

    return crypto
        .createHmac("sha256", deriveKey(secret))
        .update(value, "utf8")
        .digest("hex");
}

/**
 * Guarda un objeto como texto cifrado dentro de una columna Json. El
 * prefijo permite reconocerlo al leer y volver a convertirlo en objeto.
 */
export function encryptJson(value: unknown): string {
    return JSON_PREFIX + encryptSecret(JSON.stringify(value ?? null));
}

/**
 * Recupera un objeto guardado con `encryptJson`. Si el valor todavía está
 * en claro (datos anteriores al cifrado), lo devuelve tal cual.
 */
export function decryptJson(value: unknown): unknown {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value !== "string") {
        /** Legado: la columna Json guardaba el objeto completo. */
        return value;
    }

    const raw = value.startsWith(JSON_PREFIX)
        ? value.slice(JSON_PREFIX.length)
        : value;

    const text = isEncrypted(raw) ? safeDecryptSecret(raw) : raw;

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}
