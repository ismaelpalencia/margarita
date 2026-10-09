import { z } from "zod";

export const assignConversationSchema = z.object({
    agentId: z
        .string()
        .trim()
        .optional()
        .transform((value) => {
            if (!value || value.trim() === "") return null;
            return value.trim();
        })
});

export type AssignConversationInput = z.infer<typeof assignConversationSchema>;
