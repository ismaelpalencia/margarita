import { Request, Response } from "express";

import { appConfig } from "../config/app.config";

/**
 * Datos de contacto comercial. Se configuran por variables de entorno para
 * no tener que tocar código cada vez que cambie el número o el precio.
 */
function supportContext() {
    return {
        supportWhatsappNumber: appConfig.supportWhatsapp,
        supportWhatsappUrl: appConfig.supportWhatsapp
            ? `https://wa.me/${appConfig.supportWhatsapp}`
            : "",
        supportEmail: appConfig.supportEmail,
        setupServicePrice: appConfig.setupServicePrice,
        appName: appConfig.name
    };
}

export class HomeController {
    static async index(_req: Request, res: Response) {
        return res.render("pages/home/index", {
            title: "Margarita - WhatsApp operativo",
            ...supportContext()
        });
    }

    static async howToStart(_req: Request, res: Response) {
        return res.render("pages/home/how-to-start", {
            title: "Cómo empezar - Margarita",
            ...supportContext()
        });
    }

    /**
     * Aviso de privacidad público. Es la dirección que se puede registrar
     * en Meta y compartir con los clientes.
     */
    static async privacy(_req: Request, res: Response) {
        return res.render("pages/home/privacy", {
            title: "Aviso de privacidad - Margarita",
            ...supportContext()
        });
    }
}
