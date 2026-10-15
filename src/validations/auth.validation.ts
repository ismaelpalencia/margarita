import { z } from "zod";

import { normalizeEmail } from "../utils/email";

export const loginSchema = z.object({
    email: z
        .string()
        .trim()
        .email("Ingresa un correo válido.")
        .transform(normalizeEmail),
    password: z
        .string()
        .min(1, "La contraseña es obligatoria.")
});

export type LoginInput = z.infer<typeof loginSchema>;
