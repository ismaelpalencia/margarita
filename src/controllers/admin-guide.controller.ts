import { Request, Response } from "express";

import { appConfig } from "../config/app.config";

/**
 * «Guía» del panel: qué puede hacer la herramienta, en corto y para el equipo
 * del cliente.
 *
 * Antes aquí vivía el roadmap, que era información nuestra (lo que viene, lo
 * que está pospuesto). Al cliente eso no le sirve y, además, le cuenta de más.
 */
export class AdminGuideController {
    static async index(req: Request, res: Response) {
        if (req.accepts("json") && !req.accepts("html")) {
            return res.json({
                collectionsEnabled: Boolean(res.locals.collectionsEnabled),
                supportEmail: appConfig.supportEmail,
                supportWhatsappDisplay: appConfig.supportWhatsappDisplay,
                supportWhatsappUrl: appConfig.supportWhatsapp
                    ? `https://wa.me/${appConfig.supportWhatsapp}`
                    : ""
            });
        }
        return res.redirect("/panel/admin/guide");
    }
}
