import { z } from "zod";

export const loginSchema = z.object({
    email: z
        .string()
        .trim()
        .email("Ingresa un correo válido.")
        .toLowerCase(),
    password: z
        .string()
        .min(1, "La contraseña es obligatoria.")
});

export type LoginInput = z.infer<typeof loginSchema>;
