import { UserRole } from "@prisma/client";

export type AuthUser = {
    id: string;
    workspaceId: string;
    role: UserRole;
    email: string;
    name: string;
};
