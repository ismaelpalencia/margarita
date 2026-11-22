import { Request, Response } from "express";

import { TemplateService } from "../services/template.service";
import {
    formatTemplateLibraryIdea,
    TEMPLATE_LIBRARY
} from "../content/template-library";
import { templateVariableShape } from "../utils/template";

export class AdminTemplatesController {
    private static wantsJson(req: Request): boolean {
        return Boolean(req.accepts("json") && !req.accepts("html"));
    }

    static async index(req: Request, res: Response) {
        const templates = await TemplateService.listTemplates(
            req.user!.workspaceId
        );

        const shareTemplateUrl = `https://wa.me/5215564870481?text=${encodeURIComponent(
                "Hola, equipo Margarita. Esta plantilla de cobranza me ha funcionado y quiero compartirla para que la revisen y, si la aprueban, la agreguen a la biblioteca.\n\nSituación en la que la uso:\n\nTexto de la plantilla:\n\nBotones (si tiene):\n\nPor qué me ha funcionado:\n\nConfirmo que quité nombres, teléfonos, saldos y cualquier dato personal de clientes.\n\nAutorizo a Margarita a adaptar esta idea y publicarla en su biblioteca si la aprueba."
            )}`;

        if (AdminTemplatesController.wantsJson(req)) {
            return res.json({
                templates: templates.map(({ id, name, language, category, status, metaTemplateId, lastSyncedAt, components }) => ({
                    id, name, language, category, status, metaTemplateId, lastSyncedAt,
                    hasVariablesOrUrl: (() => { const shape = templateVariableShape(components); return shape.url > 0 || shape.header > 0; })()
                })),
                ideas: TEMPLATE_LIBRARY.map((idea) => ({ ...idea, formatted: formatTemplateLibraryIdea(idea) })),
                shareTemplateUrl,
                collectionsEnabled: Boolean(res.locals.collectionsEnabled),
                syncResult: req.query.success === "sync" ? Number(req.query.count) || 0 : null,
                syncError: req.query.error === "sync"
            });
        }

        return res.redirect("/panel/admin/templates");
    }

    static async sync(req: Request, res: Response) {
        try {
            const result = await TemplateService.syncTemplates(
                req.user!.workspaceId
            );

            if (req.accepts("json") && !req.accepts("html")) {
                return res.json({ ok: true, count: result.count });
            }

            return res.redirect(
                `/admin/templates?success=sync&count=${result.count}`
            );
        } catch (error) {
            if (req.accepts("json") && !req.accepts("html")) {
                return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudieron sincronizar las plantillas." });
            }
            return res.redirect("/admin/templates?error=sync");
        }
    }
}
