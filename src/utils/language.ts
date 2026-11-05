export type SupportedLanguage = "es" | "en" | "pt";

export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
    es: "español",
    en: "inglés",
    pt: "portugués"
};

const EN_WORDS = new Set([
    "the", "is", "are", "am", "do", "does", "what", "where", "when",
    "how", "why", "who", "hello", "hi", "thanks", "thank", "please",
    "need", "want", "price", "cost", "hours", "open", "close", "shipping",
    "delivery", "order", "address", "help", "available", "can", "you", "your",
    "i", "we", "they", "it", "this", "that"
]);

const ES_WORDS = new Set([
    "el", "la", "los", "las", "es", "son", "que", "como", "donde",
    "cuando", "cuanto", "hola", "gracias", "por", "favor", "necesito",
    "quiero", "precio", "costo", "horario", "abren", "cierran", "envio",
    "entrega", "pedido", "direccion", "ayuda", "tienen", "puedo", "para"
]);

const PT_WORDS = new Set([
    "o", "a", "os", "as", "e", "sao", "que", "como", "onde", "quando",
    "quanto", "qual", "quais", "ola", "obrigado", "obrigada", "por", "favor",
    "preciso", "quero", "preco", "custo", "horario", "abrem", "fecham",
    "envio", "entrega", "pedido", "endereco", "ajuda", "voces", "posso",
    "para", "funcionamento"
]);

function tokenize(text: string): string[] {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 2);
}

/**
 * Detecta el idioma del mensaje con señales léxicas y de acentuación.
 * Es heurístico y determinista: ante empate o duda, español.
 */
export function detectLanguage(text: string): SupportedLanguage {
    const tokens = tokenize(text || "");
    const normalized = (text || "").toLowerCase();

    let es = 0;
    let en = 0;
    let pt = 0;

    for (const token of tokens) {
        if (EN_WORDS.has(token)) en += 1;
        if (ES_WORDS.has(token)) es += 1;
        if (PT_WORDS.has(token)) pt += 1;
    }

    /** Señales de acentuación propios del portugués y del español. */
    if (/[ãõç]/.test(normalized)) pt += 2;
    if (/[ñ¿¡]/.test(normalized)) es += 2;

    if (en > es && en > pt) {
        return "en";
    }

    if (pt > es && pt > en) {
        return "pt";
    }

    return "es";
}

/**
 * Idioma con el que debe responder la IA: el detectado si está habilitado en
 * el workspace; si no, español.
 */
export function resolveReplyLanguage(
    enabled: string[],
    detected: SupportedLanguage
): SupportedLanguage {
    if (detected !== "es" && enabled.includes(detected)) {
        return detected;
    }

    return "es";
}