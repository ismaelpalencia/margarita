import { z } from "zod";

export const createTagSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, "El nombre debe tener al menos 2 caracteres."),
    color: z
        .string()
        .trim()
        .optional()
        .transform((value) => {
            if (!value || value.trim() === "") return null;
            return value.trim();
        })
});

export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, "El nombre debe tener al menos 2 caracteres."),
    color: z
        .string()
        .trim()
        .optional()
        .transform((value) => {
            if (!value || value.trim() === "") return null;
            return value.trim();
        })
});

export type UpdateTagInput = z.infer<typeof updateTagSchema>;
