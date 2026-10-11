import { z } from "zod";

function optionalText(maxLength: number) {
    return z
        .string()
        .trim()
        .max(maxLength, `No puede superar los ${maxLength} caracteres.`)
        .optional()
        .transform((value) => (value && value.length > 0 ? value : undefined));
}

export const createNumberSchema = z.object({
    displayName: optionalText(120),
    phoneNumber: z
        .string()
        .trim()
        .min(8, "El número de teléfono es obligatorio.")
        .max(20, "El número es demasiado largo."),
    phoneNumberId: z
        .string()
        .trim()
        .min(5, "El Phone Number ID es obligatorio.")
        .max(40, "El Phone Number ID es demasiado largo.")
});

export const updateNumberSchema = z.object({
    displayName: optionalText(120),
    phoneNumber: optionalText(20),
    phoneNumberId: optionalText(40)
});

export type CreateNumberInput = z.infer<typeof createNumberSchema>;
export type UpdateNumberInput = z.infer<typeof updateNumberSchema>;
