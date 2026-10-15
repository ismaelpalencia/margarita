/**
 * Traduce el `User-Agent` a algo que una persona entienda al revisar sus
 * sesiones ("Chrome en Windows" en lugar de una cadena de 120 caracteres).
 *
 * Es una heurística a propósito: no pretende identificar el dispositivo
 * exacto, solo que quien revise la lista reconozca la suya.
 */
export function describeDevice(userAgent: string | null | undefined): string {
    const value = String(userAgent ?? "").toLowerCase();

    if (!value) {
        return "Dispositivo no identificado";
    }

    const system = [
        ["iphone", "iPhone"],
        ["ipad", "iPad"],
        ["android", "Android"],
        ["windows", "Windows"],
        ["macintosh", "Mac"],
        ["mac os", "Mac"],
        ["linux", "Linux"]
    ].find(([needle]) => value.includes(needle))?.[1];

    const browser = [
        ["edg/", "Edge"],
        ["opr/", "Opera"],
        ["chrome", "Chrome"],
        ["crios", "Chrome"],
        ["firefox", "Firefox"],
        ["fxios", "Firefox"],
        ["safari", "Safari"]
    ].find(([needle]) => value.includes(needle))?.[1];

    if (browser && system) {
        return `${browser} en ${system}`;
    }

    if (browser) {
        return browser;
    }

    if (system) {
        return system;
    }

    return "Dispositivo no identificado";
}
