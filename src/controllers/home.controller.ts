import { Request, Response } from "express";

import { appConfig, servesLanding } from "../config/app.config";
import { SetupService } from "../services/setup.service";
import { loadGuide } from "../content/guides";

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
        installPriceWithMeta: appConfig.installPriceWithMeta,
        installPricePromo: appConfig.installPricePromo,
        installPromoLabel: appConfig.installPromoLabel,
        installPromoUntil: appConfig.installPromoUntil,
        installPromoSpotsLeft: appConfig.installPromoSpotsLeft,
        installMonthlyPrice: appConfig.installMonthlyPrice,
        installMonthlyListPrice: appConfig.installMonthlyListPrice,
        monthlyCommit3: appConfig.monthlyCommit3,
        monthlyCommit6: appConfig.monthlyCommit6,
        monthlyCommit12: appConfig.monthlyCommit12,
        installSavingWithMeta: appConfig.installSavingWithMeta,
        installSavingBasic: appConfig.installSavingBasic,
        pilotDays: appConfig.pilotDays,
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
            title: "Margarita — Cobranza por WhatsApp con seguridad bancaria",
            ...supportContext()
        });
    }

    /**
     * Oferta de IA para soporte y atención: la versión que compite por los
     * briefs de Workana sin mezclar cobranza. No publica precios de IA
     * porque todavía no están aprobados en `alcance-produccion.md`.
     */
    static async ai(_req: Request, res: Response) {
        return res.render("pages/home/ia", {
            title: "Asistente de IA para WhatsApp con control humano - Margarita",
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
     * Alta guiada: la página que se manda al cliente cuando dice «sí».
     * Reúne lo que tiene que traer, el plan de siete días y el checklist de
     * cierre, sin precios ni condiciones que ya viven en la propuesta.
     */
    static async onboarding(_req: Request, res: Response) {
        return res.render("pages/home/onboarding", {
            title: "Alta en 7 días - Margarita",
            ...supportContext()
        });
    }

    /**
     * Guía de uso: el manual del equipo del cliente. Es pública a propósito,
     * para que se pueda mandar por WhatsApp sin pedir sesión.
     */
    static async guide(_req: Request, res: Response) {
        const guide = loadGuide("uso");

        return res.render("pages/home/guia", {
            title: "Guía de uso - Margarita",
            guideHtml: guide.html,
            guideHeadings: guide.headings.filter((heading) => heading.level === 2),
            ...supportContext()
        });
    }

    /**
     * Guía de plantillas: cómo crearlas en Meta para que se aprueben y cuesten
     * lo menos posible. Pública por la misma razón que la guía de uso.
     */
    static async templatesGuide(_req: Request, res: Response) {
        const guide = loadGuide("plantillas");

        return res.render("pages/home/plantillas", {
            title: "Guía de plantillas - Margarita",
            guideHtml: guide.html,
            guideHeadings: guide.headings.filter((heading) => heading.level === 2),
            ...supportContext()
        });
    }

    /**
     * Propuesta comercial: la versión de la landing para un cliente que ya se
     * interesó. Vive en el sitio público y no enseña nada interno.
     */
    static async proposal(_req: Request, res: Response) {
        return res.render("pages/home/propuesta", {
            title: "Propuesta comercial - Margarita",
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
