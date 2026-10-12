import { Request, Response } from "express";

const supportWhatsappNumber = "5255XXXXXXXX";

export class HomeController {
    static async index(_req: Request, res: Response) {
        return res.render("pages/home/index", {
            title: "Margarita - WhatsApp operativo",
            supportWhatsappNumber,
            supportWhatsappUrl: `https://wa.me/${supportWhatsappNumber}`
        });
    }

    static async howToStart(_req: Request, res: Response) {
        return res.render("pages/home/how-to-start", {
            title: "Cómo empezar - Margarita",
            supportWhatsappNumber,
            supportWhatsappUrl: `https://wa.me/${supportWhatsappNumber}`
        });
    }

    /**
     * Aviso de privacidad público. Es la dirección que se puede registrar
     * en Meta y compartir con los clientes.
     */
    static async privacy(_req: Request, res: Response) {
        return res.render("pages/home/privacy", {
            title: "Aviso de privacidad - Margarita",
            supportWhatsappNumber,
            supportWhatsappUrl: `https://wa.me/${supportWhatsappNumber}`
        });
    }
}
