import { z } from "zod";

export const sendTemplateMessageSchema = z.object({
    templateId: z
        .string()
        .trim()
        .min(1, "Selecciona una plantilla."),
    variable1: z
        .string()
        .trim()
        .optional()
        .transform((value) => value || ""),
    variable2: z
        .string()
        .trim()
        .optional()
        .transform((value) => value || ""),
    variable3: z
        .string()
        .trim()
        .optional()
        .transform((value) => value || ""),
    /** Valor de la variable del encabezado, si la plantilla la pide. */
    headerVariable: z
        .string()
        .trim()
        .optional()
        .transform((value) => value || ""),
    /** Valor que se pega al final de la URL del botón, si la plantilla lo pide. */
    buttonVariable: z
        .string()
        .trim()
        .optional()
        .transform((value) => value || "")
});

export type SendTemplateMessageInput = z.infer<
    typeof sendTemplateMessageSchema
>;
