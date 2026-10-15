import { UserRole } from "@prisma/client";

export type AuthUser = {
    id: string;
    workspaceId: string;
    role: UserRole;
    email: string;
    name: string;
    /** Si es true, el sistema obliga a cambiar la contraseña antes de operar. */
    mustChangePassword: boolean;
};
