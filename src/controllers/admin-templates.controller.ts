import { Request, Response } from "express";

import { TemplateService } from "../services/template.service";
import { templateVariableShape } from "../utils/template";

export class AdminTemplatesController {
    private static wantsJson(req: Request): boolean {
        return Boolean(req.accepts("json") && !req.accepts("html"));
    }

    static async index(req: Request, res: Response) {
        const templates = await TemplateService.listTemplates(
            req.user!.workspaceId
        );

        if (AdminTemplatesController.wantsJson(req)) {
            return res.json({
                templates: templates.map(({ id, name, language, category, status, metaTemplateId, lastSyncedAt, components }) => ({
                    id, name, language, category, status, metaTemplateId, lastSyncedAt,
                    hasVariablesOrUrl: (() => { const shape = templateVariableShape(components); return shape.url > 0 || shape.header > 0; })()
                })),
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
