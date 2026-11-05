import { z } from "zod";

/**
 * Formulario de «enviar botones». Los tres campos de botón van separados en el
 * HTML (es lo más simple de llenar); el servicio arma la lista y valida los
 * límites de Meta con un mensaje claro.
 */
export const sendInteractiveMessageSchema = z.object({
    body: z
        .string()
        .trim()
        .min(1, "Escribe el texto del mensaje.")
        .max(1024, "El texto no puede pasar de 1024 caracteres."),
    footer: z.string().trim().max(60).optional(),
    button1: z.string().trim().max(20).optional(),
    button2: z.string().trim().max(20).optional(),
    button3: z.string().trim().max(20).optional()
});

export type SendInteractiveMessageInput = z.infer<
    typeof sendInteractiveMessageSchema
>;
/**
 * Formulario de «enviar lista». Las filas se mandan como campos repetidos
 * (rowTitle/rowDescription) y el controlador las empareja por índice; el
 * builder valida los límites de Meta con un mensaje claro.
 */
export const sendInteractiveListSchema = z.object({
    body: z
        .string()
        .trim()
        .min(1, "Escribe el texto del mensaje.")
        .max(1024, "El texto no puede pasar de 1024 caracteres."),
    footer: z.string().trim().max(60).optional(),
    buttonLabel: z
        .string()
        .trim()
        .min(1, "Escribe el texto del botón que abre la lista.")
        .max(20, "El botón no puede pasar de 20 caracteres."),
    sectionTitle: z.string().trim().max(24).optional(),
    rowTitle: z.union([z.string(), z.array(z.string())]).optional(),
    rowDescription: z.union([z.string(), z.array(z.string())]).optional()
});

export type SendInteractiveListInput = z.infer<
    typeof sendInteractiveListSchema
>;

function asArray(value: string | string[] | undefined): string[] {
    if (Array.isArray(value)) {
        return value;
    }

    return typeof value === "string" ? [value] : [];
}

/** Empareja títulos y descripciones por índice para el builder. */
export function listRowsFromInput(
    input: SendInteractiveListInput
): Array<{ title: string; description: string }> {
    const titles = asArray(input.rowTitle);
    const descriptions = asArray(input.rowDescription);

    return titles.map((title, index) => ({
        title,
        description: descriptions[index] || ""
    }));
}

