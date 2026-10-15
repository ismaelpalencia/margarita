import { UserRole } from "@prisma/client";
import { z } from "zod";

import { passwordSchema } from "./password.validation";
import { normalizeEmail } from "../utils/email";

const nameField = z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres.");

const emailField = z
    .string()
    .trim()
    .email("Ingresa un correo válido.")
    .transform(normalizeEmail);

const limitField = z
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
    });

const permissionField = z
    .optional(z.literal("on"))
    .transform((value) => value === "on");

export const createUserSchema = z.object({
    name: nameField,
    email: emailField,
    password: passwordSchema,
    role: z.nativeEnum(UserRole, {
        errorMap: () => ({ message: "Elige un rol válido." })
    }),
    canSendManualMessages: permissionField,
    manualMessageLimit: limitField
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
    name: nameField,
    role: z.nativeEnum(UserRole, {
        errorMap: () => ({ message: "Elige un rol válido." })
    }),
    canSendManualMessages: permissionField,
    manualMessageLimit: limitField
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({
    password: passwordSchema
});

/**
 * Código de la verificación en dos pasos. Son seis dígitos: se limpian los
 * espacios (las apps los muestran como "123 456") y se exige que queden
 * exactamente seis números.
 */
export const twoFactorCodeSchema = z.object({
    code: z
        .string()
        .trim()
        .transform((value) => value.replace(/\s/g, ""))
        .refine((value) => /^\d{6}$/.test(value), {
            message: "El código son 6 dígitos."
        })
});

export type TwoFactorCodeInput = z.infer<typeof twoFactorCodeSchema>;

export const changePasswordSchema = z
    .object({
        currentPassword: z
            .string()
            .min(1, "Escribe tu contraseña actual."),
        password: passwordSchema,
        confirmPassword: z
            .string()
            .min(1, "Repite la contraseña nueva.")
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "La contraseña nueva y su confirmación no coinciden.",
        path: ["confirmPassword"]
    });
