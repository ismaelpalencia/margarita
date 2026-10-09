import { Request, Response } from "express";

import { TemplateService } from "../services/template.service";

export class AdminTemplatesController {
    static async index(req: Request, res: Response) {
        const templates = await TemplateService.listTemplates(
            req.user!.workspaceId
        );

        return res.render("pages/admin/templates/index", {
            user: req.user,
            templates,
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