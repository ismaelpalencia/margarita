import { UserStatus } from "@prisma/client";
import { z } from "zod";

export const updateAgentStatusSchema = z.object({
    status: z.nativeEnum(UserStatus)
});

export type UpdateAgentStatusInput = z.infer<typeof updateAgentStatusSchema>;
