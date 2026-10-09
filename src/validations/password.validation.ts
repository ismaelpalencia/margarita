import { z } from "zod";

const COMMON_PASSWORDS = new Set([
    "1234567890",
    "12345678901",
    "password123",
    "contrasena1",
    "margarita1",
    "qwerty12345",
    "admin12345",
    "whatsapp123",
    "0000000000",
    "aaaaaaaaaa"
]);

export const MIN_PASSWORD_LENGTH = 10;

/**
 * Política mínima de contraseñas: longitud suficiente, letras y números
 * mezclados, y fuera de la lista de contraseñas obvias.
 */
export const passwordSchema = z
    .string()
    .min(
        MIN_PASSWORD_LENGTH,
        `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
    )
    .max(128, "La contraseña no puede superar los 128 caracteres.")
    .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
        message: "La contraseña debe incluir letras y números."
    })
    .refine((value) => !COMMON_PASSWORDS.has(value.trim().toLowerCase()), {
        message: "Esa contraseña es demasiado común. Elige otra."
    });
