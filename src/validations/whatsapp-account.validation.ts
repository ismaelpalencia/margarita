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

/**
 * Alta de la cuenta desde el panel, para no depender del seed en una
 * instalación nueva.
 */
export const createWhatsAppAccountSchema = z.object({
    businessAccountId: z
        .string()
        .trim()
        .min(5, "El Business Account ID es obligatorio.")
        .max(40, "El Business Account ID es demasiado largo."),
    apiVersion: z
        .string()
        .trim()
        .regex(/^v\d+\.\d+$/, "Usa el formato v23.0.")
        .optional()
        .transform((value) => (value && value.length > 0 ? value : undefined)),
    accessToken: z
        .string()
        .trim()
        .min(20, "El access token parece incompleto."),
    verifyToken: z
        .string()
        .trim()
        .min(4, "El verify token es obligatorio.")
        .max(200, "El verify token es demasiado largo.")
});

export type CreateWhatsAppAccountInput = z.infer<
    typeof createWhatsAppAccountSchema
>;
