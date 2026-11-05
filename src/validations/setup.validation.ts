import { WorkspaceProfile } from "@prisma/client";
import { z } from "zod";

import { passwordSchema } from "./password.validation";

export const setupSchema = z.object({
    workspaceName: z
        .string()
        .trim()
        .min(2, "El nombre de la empresa es obligatorio.")
        .max(120, "El nombre es demasiado largo."),
    workspaceSlug: z
        .string()
        .trim()
        .toLowerCase()
        .min(2, "El identificador es obligatorio.")
        .max(60, "El identificador es demasiado largo.")
        .regex(
            /^[a-z0-9]+(-[a-z0-9]+)*$/,
            "Usa solo letras minúsculas, números y guiones (por ejemplo: ferreteria-lopez)."
        ),
    adminName: z
        .string()
        .trim()
        .min(2, "Tu nombre es obligatorio.")
        .max(120, "El nombre es demasiado largo."),
    adminEmail: z
        .string()
        .trim()
        .email("Ingresa un correo válido.")
        .toLowerCase(),
    adminPassword: passwordSchema,
    /**
     * Giro con el que nace la instalación. El alta solo ofrece comercio,
     * servicios o genérico: COBRANZA queda para instalaciones existentes y
     * no se puede elegir desde aquí.
     */
    profile: z
        .nativeEnum(WorkspaceProfile, {
            message: "Elige un giro válido."
        })
        .default(WorkspaceProfile.GENERICO)
        .refine((profile) => profile !== WorkspaceProfile.COBRANZA, {
            message: "Elige comercio, servicios o genérico."
        })
});

export type SetupInput = z.infer<typeof setupSchema>;
