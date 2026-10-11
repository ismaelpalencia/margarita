import { Request, Response } from "express";

import { appConfig } from "../config/app.config";

/**
 * Cambia el número activo de la sesión.
 *
 * El destino de la redirección se valida para que solo pueda ser una ruta
 * interna: aceptar una URL completa sería un redirect abierto.
 */
export class ActiveNumberController {
    static async switch(req: Request, res: Response) {
        const numberId =
            typeof req.body?.numberId === "string" ? req.body.numberId : "";

        const rawRedirect =
            typeof req.body?.redirectTo === "string" ? req.body.redirectTo : "/";

        const safeRedirect =
            rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
                ? rawRedirect
                : "/";

        const belongsToWorkspace = (res.locals.activeNumbers || []).some(
            (number: { id: string }) => number.id === numberId
        );

        if (belongsToWorkspace) {
            res.cookie(appConfig.activeNumberCookieName, numberId, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: 30 * 24 * 60 * 60 * 1000
            });
        }

        return res.redirect(safeRedirect);
    }
}
