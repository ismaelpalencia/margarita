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