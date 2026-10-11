import { AuthUser } from "./auth";
import { WhatsAppNumber } from "@prisma/client";

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
            tokenId?: string;
            rawBody?: string;
            /** Número con el que está trabajando el usuario en esta sesión. */
            activeNumber?: WhatsAppNumber | null;
        }
    }
}

export {};
