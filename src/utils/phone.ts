import { blindIndex } from "./crypto";

/**
 * Normaliza un teléfono para WhatsApp.
 *
 * Reglas:
 * - Un número local de 10 dígitos se interpreta como México y se guarda en el
 *   formato que usa WhatsApp (`521` + 10 dígitos).
 * - `52` + 10 dígitos también se convierte al formato de WhatsApp de México.
 * - Cualquier número con `+` o `00` se conserva como número internacional
 *   (solo dígitos, sin el signo).
 * - Un número sin `+` de 11 a 15 dígitos se conserva si ya incluye lada de país;
 *   para evitar ambigüedad, la interfaz pide el `+` cuando no es México.
 */
export function normalizePhone(rawPhone: string): string {
    const raw = String(rawPhone ?? "").trim();
    const digits = raw.replace(/\D/g, "");

    if (!digits) {
        throw new Error("El teléfono es obligatorio.");
    }

    const explicitInternational = /^(?:\+|00)/.test(raw);
    const withoutExitCode =
        explicitInternational && digits.startsWith("00")
            ? digits.slice(2)
            : digits;

    if (!withoutExitCode) {
        throw new Error("El teléfono es obligatorio.");
    }

    /**
     * México sigue siendo el caso por defecto:
     * 55 4853 6808 -> 5215548536808
     * 52 55 4853 6808 -> 5215548536808
     * 521 55 4853 6808 -> 5215548536808
     */
    if (!explicitInternational && withoutExitCode.length === 10) {
        return `521${withoutExitCode}`;
    }

    if (withoutExitCode.length === 12 && withoutExitCode.startsWith("52")) {
        return `521${withoutExitCode.slice(2)}`;
    }

    if (withoutExitCode.length === 13 && withoutExitCode.startsWith("521")) {
        return withoutExitCode;
    }

    /**
     * Números internacionales. Se aceptan de 8 a 15 dígitos; el límite de 15
     * es el máximo de E.164. No se inventa una lada: si el cliente escribe
     * `+1 ...` o `+44 ...`, se conserva tal cual.
     */
    if (
        (explicitInternational || withoutExitCode.length >= 11) &&
        withoutExitCode.length >= 8 &&
        withoutExitCode.length <= 15 &&
        !withoutExitCode.startsWith("0")
    ) {
        return withoutExitCode;
    }

    throw new Error(
        "Teléfono inválido. Para México usa 10 dígitos; para otro país usa el número completo con + y lada."
    );
}

export function isValidPhone(rawPhone: string): boolean {
    try {
        normalizePhone(rawPhone);
        return true;
    } catch {
        return false;
    }
}

/** Compatibilidad con llamadas antiguas. */
export const normalizeMexicanPhone = normalizePhone;

/** Compatibilidad con llamadas antiguas. */
export const isValidMexicanPhone = isValidPhone;

/**
 * Datos de teléfono de un contacto para guardarlo cifrado.
 *
 * El teléfono viaja en claro hasta Prisma; la extensión de cifrado lo
 * guarda cifrado. El `phoneHash` es el índice ciego que conserva la
 * unicidad y la búsqueda exacta.
 */
export function contactPhoneFields(phone: string): {
    phone: string;
    phoneHash: string;
} {
    return {
        phone,
        phoneHash: blindIndex(phone)
    };
}
