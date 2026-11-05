import { Request, Response } from "express";

import { TemplateService } from "../services/template.service";
import {
    formatTemplateLibraryIdea,
    TEMPLATE_LIBRARY
} from "../content/template-library";
import { templateVariableShape } from "../utils/template";

export class AdminTemplatesController {
    static async index(req: Request, res: Response) {
        const templates = await TemplateService.listTemplates(
            req.user!.workspaceId
        );

        return res.render("pages/admin/templates/index", {
            user: req.user,
            templates,
            templateIdeas: TEMPLATE_LIBRARY,
            formatTemplateLibraryIdea,
            shareTemplateUrl: `https://wa.me/15559337514?text=${encodeURIComponent(
                "Hola, equipo Margarita. Esta plantilla de cobranza me ha funcionado y quiero compartirla para que la revisen y, si la aprueban, la agreguen a la biblioteca.\n\nSituación en la que la uso:\n\nTexto de la plantilla:\n\nBotones (si tiene):\n\nPor qué me ha funcionado:\n\nConfirmo que quité nombres, teléfonos, saldos y cualquier dato personal de clientes.\n\nAutorizo a Margarita a adaptar esta idea y publicarla en su biblioteca si la aprueba."
            )}`,
            /** Para marcar las que traen encabezado con variable o botón. */
            templateVariableShape,
            success: req.query.success || null,
            error: req.query.error || null,
            count: req.query.count || null
        });
    }

    static async sync(req: Request, res: Response) {
        try {
            const result = await TemplateService.syncTemplates(
                req.user!.workspaceId
            );

            return res.redirect(
                `/admin/templates?success=sync&count=${result.count}`
            );
        } catch {
            return res.redirect("/admin/templates?error=sync");
        }
    }
}
