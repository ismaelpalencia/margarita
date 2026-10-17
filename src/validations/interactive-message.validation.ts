import { z } from "zod";

/**
 * Formulario de «enviar botones». Los tres campos de botón van separados en el
 * HTML (es lo más simple de llenar); el servicio arma la lista y valida los
 * límites de Meta con un mensaje claro.
 */
export const sendInteractiveMessageSchema = z.object({
    body: z
        .string()
        .trim()
        .min(1, "Escribe el texto del mensaje.")
        .max(1024, "El texto no puede pasar de 1024 caracteres."),
    footer: z.string().trim().max(60).optional(),
    button1: z.string().trim().max(20).optional(),
    button2: z.string().trim().max(20).optional(),
    button3: z.string().trim().max(20).optional()
});

export type SendInteractiveMessageInput = z.infer<
    typeof sendInteractiveMessageSchema
>;
