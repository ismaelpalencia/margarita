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
    static async index(_req: Request, res: Response) {
        return res.render("pages/admin/guide/index", {
            user: _req.user,
            supportEmail: appConfig.supportEmail,
            supportWhatsappDisplay: appConfig.supportWhatsappDisplay,
            supportWhatsappUrl: appConfig.supportWhatsapp
                ? `https://wa.me/${appConfig.supportWhatsapp}`
                : ""
        });
    }
}
