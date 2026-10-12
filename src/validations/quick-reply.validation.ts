import { z } from "zod";

const titleField = z
    .string()
    .trim()
    .min(2, "El título debe tener al menos 2 caracteres.")
    .max(60, "El título no puede superar los 60 caracteres.");

const bodyField = z
    .string()
    .trim()
    .min(2, "La respuesta no puede estar vacía.")
    .max(2000, "La respuesta no puede superar los 2000 caracteres.");

export const createQuickReplySchema = z.object({
    title: titleField,
    body: bodyField
});

export type CreateQuickReplyInput = z.infer<typeof createQuickReplySchema>;

export const updateQuickReplySchema = createQuickReplySchema;

export type UpdateQuickReplyInput = z.infer<typeof updateQuickReplySchema>;
