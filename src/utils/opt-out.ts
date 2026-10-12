/**
 * Baja de contactos (BAJA/STOP).
 *
 * Cuando un cliente escribe la palabra clave, la herramienta marca al
 * contacto como dado de baja y deja de enviarle mensajes: ni campañas ni
 * respuestas manuales. Revertirlo es una decisión explícita del operador.
 */

export const DEFAULT_OPT_OUT_KEYWORDS = ["STOP"];

/**
 * Deja el texto comparable: sin acentos, en mayúsculas y sin signos.
 * Así "¡Stop!" y "STOP" son la misma palabra.
 */
export function normalizeForComparison(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Lee la lista de palabras clave. Se aceptan varias separadas por coma:
 * `OPT_OUT_KEYWORDS="STOP,BAJA,CANCELAR"`. Sin configuración, solo STOP.
 */
export function parseOptOutKeywords(raw?: string | null): string[] {
    const parsed = (raw ?? "")
        .split(/[,\n]/)
        .map((keyword) => normalizeForComparison(keyword))
        .filter((keyword) => keyword.length > 0);

    return parsed.length > 0 ? parsed : [...DEFAULT_OPT_OUT_KEYWORDS];
}

/**
 * ¿El mensaje pide la baja?
 *
 * Se revisa la palabra con la que empieza el mensaje, para que "STOP" y
 * "STOP por favor" cuenten, pero una frase que solo menciona la palabra
 * ("el botón de stop no funciona") no dé de baja a nadie por accidente.
 */
export function matchesOptOutKeyword(
    body: string | null | undefined,
    keywords: string[]
): boolean {
    if (!body) {
        return false;
    }

    const normalized = normalizeForComparison(body);

    if (!normalized) {
        return false;
    }

    const candidates =
        keywords.length > 0 ? keywords : DEFAULT_OPT_OUT_KEYWORDS;

    const firstWord = normalized.split(" ")[0];

    return candidates.includes(normalized) || candidates.includes(firstWord);
}
