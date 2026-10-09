import { z } from "zod";

export const sendFreeTextMessageSchema = z.object({
    body: z
        .string()
        .trim()
        .min(1, "El mensaje no puede estar vacío.")
        .max(4000, "El mensaje no puede superar los 4000 caracteres.")
});

export type SendFreeTextMessageInput = z.infer<
    typeof sendFreeTextMessageSchema
>;
