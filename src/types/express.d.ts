import { AuthUser } from "./auth";
import { WhatsAppNumber, WorkspaceProfile } from "@prisma/client";

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
            tokenId?: string;
            rawBody?: string;
            /** Número con el que está trabajando el usuario en esta sesión. */
            activeNumber?: WhatsAppNumber | null;
            /** Giro de la instalación, resuelto por `workspaceProfileMiddleware`. */
            workspaceProfile?: WorkspaceProfile;
        }
    }
}

export {};
