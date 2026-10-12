import { blindIndex } from "./crypto";

export function normalizeMexicanPhone(rawPhone: string): string {
    const digits = rawPhone.replace(/\D/g, "");

    if (!digits) {
        throw new Error("El teléfono es obligatorio.");
    }

    /**
     * Formato local mexicano:
     * 55 4853 6808 -> 5215548536808
     */
    if (digits.length === 10) {
        return `521${digits}`;
    }

    /**
     * Formato México sin 1:
     * 52 55 4853 6808 -> 5215548536808
     */
    if (digits.length === 12 && digits.startsWith("52")) {
        return `521${digits.slice(2)}`;
    }

    /**
     * Formato WhatsApp México:
     * 521 55 4853 6808 -> 5215548536808
     */
    if (digits.length === 13 && digits.startsWith("521")) {
        return digits;
    }

    throw new Error("Teléfono inválido. Usa un número mexicano de 10 dígitos.");
}

export function isValidMexicanPhone(rawPhone: string): boolean {
    try {
        normalizeMexicanPhone(rawPhone);
        return true;
    } catch {
        return false;
    }
}

/**
 * Datos de teléfono de un contacto para guardarlo cifrado.
 *
 * El teléfono viaja en claro hasta Prisma; la extensión de cifrado lo
 * guarda cifrado. El `phoneHash` es el índice ciego que conserva la
 * unicidad y la búsqueda exacta, porque la columna del teléfono ya no se
 * puede comparar.
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
