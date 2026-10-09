import { z } from "zod";

export const createAgentSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, "El nombre debe tener al menos 2 caracteres."),
    email: z
        .string()
        .trim()
        .email("Ingresa un correo válido.")
        .toLowerCase(),
    password: z
        .string()
        .min(6, "La contraseña debe tener al menos 6 caracteres."),
    canSendManualMessages: z
        .optional(z.literal("on"))
        .transform((value) => value === "on"),
    manualMessageLimit: z
        .string()
        .optional()
        .transform((value) => {
            if (!value || value.trim() === "") return null;
            return Number(value);
        })
        .refine((value) => value === null || Number.isInteger(value), {
            message: "El límite debe ser un número entero."
        })
        .refine((value) => value === null || value >= 0, {
            message: "El límite no puede ser negativo."
        })
});

export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const updateAgentSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, "El nombre debe tener al menos 2 caracteres."),
    canSendManualMessages: z
        .optional(z.literal("on"))
        .transform((value) => value === "on"),
    manualMessageLimit: z
        .string()
        .optional()
        .transform((value) => {
            if (!value || value.trim() === "") return null;
            return Number(value);
        })
        .refine((value) => value === null || Number.isInteger(value), {
            message: "El límite debe ser un número entero."
        })
        .refine((value) => value === null || value >= 0, {
            message: "El límite no puede ser negativo."
        })
});

export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
