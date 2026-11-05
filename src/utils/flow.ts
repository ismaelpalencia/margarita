/**
 * Flujos precargados: utilidades puras para emparejar el trigger.
 *
 * Un flujo es una sola respuesta automática: si el texto del cliente contiene
 * el trigger (separado por |), se envía la respuesta con botones o lista.
 */

export function normalizeFlowText(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * ¿El texto del cliente dispara este flujo? El trigger admite varias
 * alternativas separadas por | (por ejemplo "hola|buenos dias").
 */
export function flowTriggerMatches(trigger: string, text: string): boolean {
    const normalized = normalizeFlowText(text);

    if (!normalized) {
        return false;
    }

    return trigger
        .split("|")
        .map((part) => normalizeFlowText(part))
        .filter((part) => part.length > 0)
        .some((part) => normalized.includes(part));
}

export type FlowButton = { id: string; title: string };

export type FlowListRow = {
    id: string;
    title: string;
    description?: string;
};

export type FlowList = {
    buttonLabel: string;
    sectionTitle?: string;
    rows: FlowListRow[];
};

/** WhatsApp limita el título de un botón a 20 caracteres. */
const MAX_FLOW_BUTTON_TITLE = 20;

const BUTTON_TITLE_FALLBACKS: Record<string, string> = {
    "hablar con una persona": "Hablar con asesor",
    "pasar con una persona": "Pasar con asesor"
};

/**
 * Ajusta el título de un botón de flujo al límite de Meta. Los flujos
 * sembrados antes del límite (o editados a mano) pueden traer títulos
 * largos; se corrigen al enviar para no romper el mensaje interactivo.
 */
export function fitFlowButtonTitle(title: string): string {
    const clean = (title || "").trim();
    const fixed = BUTTON_TITLE_FALLBACKS[clean.toLowerCase()] ?? clean;
    const fitted = fixed.slice(0, MAX_FLOW_BUTTON_TITLE).trim();

    return fitted || "Ver opciones";
}
