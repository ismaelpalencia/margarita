/** Extrae el primer correo de un texto libre, si lo hay. */
export function extractEmail(text: string): string | null {
    const match = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.exec(text || "");

    return match ? match[0] : null;
}