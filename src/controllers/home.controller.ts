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
}