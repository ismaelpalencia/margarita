import { z } from "zod";

function optionalText(maxLength: number) {
    return z
        .string()
        .trim()
        .max(maxLength, `No puede superar los ${maxLength} caracteres.`)
        .optional()
        .transform((value) => (value && value.length > 0 ? value : undefined));
}

/**
 * Credenciales de la WABA: se comparten entre todos los números.
 */
export const updateWhatsAppCredentialsSchema = z.object({
    businessAccountId: optionalText(40),
    apiVersion: z
        .string()
        .trim()
        .regex(/^v\d+\.\d+$/, "Usa el formato v23.0.")
        .optional()
        .transform((value) => (value && value.length > 0 ? value : undefined)),
    accessToken: optionalText(2000),
    verifyToken: optionalText(200)
});

export type UpdateWhatsAppCredentialsInput = z.infer<
    typeof updateWhatsAppCredentialsSchema
>;
