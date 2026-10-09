import { z } from "zod";

function normalizeTagIds(value: unknown): string[] {
    if (!value) return [];

    if (Array.isArray(value)) {
        return value.map(String);
    }

    return [String(value)];
}

export const createContactSchema = z.object({
    customName: z
        .string()
        .trim()
        .optional()
        .transform((value) => {
            if (!value || value.trim() === "") return null;
            return value.trim();
        }),
    phone: z
        .string()
        .trim()
        .min(1, "El teléfono es obligatorio."),
    notes: z
        .string()
        .trim()
        .optional()
        .transform((value) => {
            if (!value || value.trim() === "") return null;
            return value.trim();
        }),
    tagIds: z
        .unknown()
        .optional()
        .transform(normalizeTagIds)
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = z.object({
    customName: z
        .string()
        .trim()
        .optional()
        .transform((value) => {
            if (!value || value.trim() === "") return null;
            return value.trim();
        }),
    notes: z
        .string()
        .trim()
        .optional()
        .transform((value) => {
            if (!value || value.trim() === "") return null;
            return value.trim();
        }),
    tagIds: z
        .unknown()
        .optional()
        .transform(normalizeTagIds)
});

export type UpdateContactInput = z.infer<typeof updateContactSchema>;
