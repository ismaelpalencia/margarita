import crypto from "node:crypto";

/**
 * Verificación en dos pasos (TOTP, RFC 6238): el código de 6 dígitos que
 * genera cualquier app de autenticación.
 *
 * Se implementa aquí, sin dependencias, porque son ~40 líneas de
 * `node:crypto` y evita sumar un paquete al despliegue por algo tan acotado.
 * Lo que sí se respeta es el estándar: si una app de autenticación funciona
 * con Google, GitHub o Meta, funciona con esto.
 */

/** Alfabeto base32 sin los caracteres que se confunden al transcribir. */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const TOTP_DIGITS = 6;
export const TOTP_STEP_SECONDS = 30;
/** Se acepta una ventana antes y una después, por relojes desfasados. */
export const TOTP_WINDOW = 1;

export function base32Encode(buffer: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = "";

    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;

        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }

    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }

    return output;
}

export function base32Decode(secret: string): Buffer {
    const clean = secret.replace(/[\s=-]/g, "").toUpperCase();

    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (const character of clean) {
        const index = BASE32_ALPHABET.indexOf(character);

        if (index === -1) {
            throw new Error(
                "El secreto de verificación en dos pasos tiene un formato inválido."
            );
        }

        value = (value << 5) | index;
        bits += 5;

        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }

    return Buffer.from(bytes);
}

/** Secreto nuevo de 20 bytes (160 bits), como recomienda el RFC. */
export function generateTotpSecret(): string {
    return base32Encode(crypto.randomBytes(20));
}

/**
 * Código TOTP para un instante dado. Se expone para poder probarlo contra
 * los vectores del RFC.
 */
export function totpCode(
    secret: string,
    timestampMs: number,
    options: { digits?: number; stepSeconds?: number } = {}
): string {
    const digits = options.digits ?? TOTP_DIGITS;
    const step = options.stepSeconds ?? TOTP_STEP_SECONDS;

    const counter = Math.floor(timestampMs / 1000 / step);
    const buffer = Buffer.alloc(8);

    buffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
    buffer.writeUInt32BE(counter % 2 ** 32, 4);

    const hmac = crypto
        .createHmac("sha1", base32Decode(secret))
        .update(buffer)
        .digest();

    /** Truncamiento dinámico del RFC 4226. */
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

    return String(binary % 10 ** digits).padStart(digits, "0");
}

/** ¿El código corresponde al secreto, dentro de la ventana aceptada? */
export function verifyTotp(
    secret: string,
    code: string,
    options: { now?: number; window?: number } = {}
): boolean {
    const cleaned = code.replace(/\D/g, "");

    if (cleaned.length !== TOTP_DIGITS) {
        return false;
    }

    const now = options.now ?? Date.now();
    const window = options.window ?? TOTP_WINDOW;

    for (let offset = -window; offset <= window; offset += 1) {
        const candidate = totpCode(
            secret,
            now + offset * TOTP_STEP_SECONDS * 1000
        );

        /**
         * Comparación en tiempo constante: no queremos que el tiempo de
         * respuesta delate cuántos dígitos acertó quien está probando.
         */
        if (
            candidate.length === cleaned.length &&
            crypto.timingSafeEqual(
                Buffer.from(candidate, "utf8"),
                Buffer.from(cleaned, "utf8")
            )
        ) {
            return true;
        }
    }

    return false;
}

/**
 * URI que entienden las apps de autenticación. Se muestra como respaldo del
 * código QR (la app permite pegar la clave a mano).
 */
export function buildOtpAuthUrl(params: {
    secret: string;
    account: string;
    issuer: string;
}): string {
    const label = encodeURIComponent(`${params.issuer}:${params.account}`);
    const issuer = encodeURIComponent(params.issuer);

    return (
        `otpauth://totp/${label}` +
        `?secret=${params.secret}` +
        `&issuer=${issuer}` +
        `&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`
    );
}

/** Secreto en grupos de cuatro, para poder dictarlo sin perder el hilo. */
export function formatSecretForHumans(secret: string): string {
    return secret.replace(/(.{4})/g, "$1 ").trim();
}
