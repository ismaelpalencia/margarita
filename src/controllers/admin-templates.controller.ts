import { Request, Response } from "express";

import { TemplateService } from "../services/template.service";
import { templateVariableShape } from "../utils/template";
import { getRequiredParam } from "../utils/request";

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

    static async quality(req: Request, res: Response) {
        try {
            const templates = await TemplateService.getTemplateQuality(req.user!.workspaceId);
            return res.json({ templates, checkedAt: new Date().toISOString() });
        } catch (error) {
            return res.status(502).json({ error: error instanceof Error ? error.message : "No se pudo consultar la calidad de las plantillas en Meta." });
        }
    }

    static async create(req: Request, res: Response) {
        const name = String(req.body?.name || "").trim().toLowerCase();
        const language = String(req.body?.language || "").trim();
        const category = String(req.body?.category || "UTILITY").trim().toUpperCase();
        const header = String(req.body?.header || "").trim();
        const body = String(req.body?.body || "").trim();
        const footer = String(req.body?.footer || "").trim();

        if (!/^[a-z0-9_]{1,512}$/.test(name)) {
            const error = "El nombre debe usar minúsculas, números y guiones bajos.";
            return AdminTemplatesController.createResponse(req, res, 400, error);
        }
        if (!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language)) {
            const error = "El idioma debe tener formato es_MX o en_US.";
            return AdminTemplatesController.createResponse(req, res, 400, error);
        }
        if (!["MARKETING", "UTILITY"].includes(category)) {
            const error = "La categoría debe ser MARKETING o UTILITY. Las plantillas de autenticación se crean desde Meta.";
            return AdminTemplatesController.createResponse(req, res, 400, error);
        }
        if (!body || body.length > 1024 || header.length > 60 || footer.length > 60) {
            const error = "Revisa el cuerpo (1–1024) y el encabezado/pie (máximo 60).";
            return AdminTemplatesController.createResponse(req, res, 400, error);
        }

        try {
            const template = await TemplateService.createTemplate(
                req.user!.workspaceId,
                { name, language, category, header, body, footer }
            );

            if (AdminTemplatesController.wantsJson(req)) {
                return res.json({
                    ok: true,
                    template: {
                        id: template.id,
                        name: template.name,
                        language: template.language,
                        status: template.status
                    }
                });
            }

            return res.redirect("/panel/admin/templates?success=created");
        } catch (error) {
            return AdminTemplatesController.createResponse(
                req,
                res,
                400,
                error instanceof Error ? error.message : "No se pudo crear la plantilla."
            );
        }
    }

    private static createResponse(
        req: Request,
        res: Response,
        status: number,
        error: string
    ) {
        if (AdminTemplatesController.wantsJson(req)) {
            return res.status(status).json({ error });
        }
        return res.redirect("/panel/admin/templates?error=create");
    }

    static async remove(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            await TemplateService.deleteTemplate(req.user!.workspaceId, id);
            if (AdminTemplatesController.wantsJson(req)) {
                return res.json({ ok: true });
            }
            return res.redirect("/panel/admin/templates?success=deleted");
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo eliminar la plantilla.";
            if (AdminTemplatesController.wantsJson(req)) {
                return res.status(400).json({ error: message });
            }
            return res.redirect("/panel/admin/templates?error=delete");
        }
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
