import { Request, Response } from "express";

import { appConfig, servesLanding } from "../config/app.config";
import { SetupService } from "../services/setup.service";

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
        supportWhatsappDisplay: appConfig.supportWhatsappDisplay,
        setupServicePrice: appConfig.setupServicePrice,
        installPrice: appConfig.installPrice,
        installPricePromo: appConfig.installPricePromo,
        installPromoLabel: appConfig.installPromoLabel,
        installPromoUntil: appConfig.installPromoUntil,
        installMonthlyPrice: appConfig.installMonthlyPrice,
        installMonthlyListPrice: appConfig.installMonthlyListPrice,
        appName: appConfig.name
    };
}

export class HomeController {
    static async index(req: Request, res: Response) {
        /**
         * Instalación recién creada (por ejemplo desde la plantilla de
         * Railway): en lugar de la página de venta, se manda al asistente de
         * alta. Así el cliente entra directo a configurar y no tiene que
         * adivinar la ruta.
         */
        try {
            if (!(await SetupService.isConfigured())) {
                return res.redirect("/setup");
            }
        } catch {
            /** Si la base no responde, se muestra la landing normal. */
        }

        /**
         * Cada operación vive en su propio subdominio (por ejemplo
         * `palencia.margaritaapp.org`) y ahí la raíz no es la página de venta:
         * el equipo del cliente cae directo al inicio de sesión. La oferta vive
         * en los dominios declarados en `PRODUCT_DOMAIN`, y de ahí en adelante
         * en su propio sitio estático (`landing/`).
         */
        if (!servesLanding(req.hostname || "")) {
            return res.redirect("/auth/login");
        }

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
     * «Ya tengo acceso»: la página a la que apunta el botón de la landing
     * estática. Explica de dónde se entra, porque cada operación tiene su
     * propio subdominio y aquí no hay formulario que valga.
     */
    static async access(_req: Request, res: Response) {
        return res.render("pages/home/access", {
            title: "Ya tengo acceso - Margarita",
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
