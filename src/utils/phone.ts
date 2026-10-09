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
