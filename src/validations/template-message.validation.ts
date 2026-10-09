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
        .transform((value) => value || "")
});

export type SendTemplateMessageInput = z.infer<
    typeof sendTemplateMessageSchema
>;
