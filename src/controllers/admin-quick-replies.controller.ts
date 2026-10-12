import { Request, Response } from "express";

import { QuickReplyService } from "../services/quick-reply.service";
import { getRequiredParam } from "../utils/request";
import {
    createQuickReplySchema,
    updateQuickReplySchema
} from "../validations/quick-reply.validation";

export class AdminQuickRepliesController {
    static async index(req: Request, res: Response) {
        const quickReplies = await QuickReplyService.listAll(
            req.user!.workspaceId
        );

        return res.render("pages/admin/quick-replies/index", {
            user: req.user,
            quickReplies,
            success: req.query.success || null,
            error: req.query.error || null
        });
    }

    static async create(req: Request, res: Response) {
        const parsed = createQuickReplySchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect("/admin/quick-replies?error=validation");
        }

        try {
            await QuickReplyService.create(
                req.user!.workspaceId,
                req.user!.id,
                parsed.data
            );

            return res.redirect("/admin/quick-replies?success=created");
        } catch {
            return res.redirect("/admin/quick-replies?error=create");
        }
    }

    static async showEdit(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            const quickReply = await QuickReplyService.getById(
                req.user!.workspaceId,
                id
            );

            return res.render("pages/admin/quick-replies/edit", {
                user: req.user,
                quickReply,
                error: null
            });
        } catch {
            return res.redirect("/admin/quick-replies");
        }
    }

    static async update(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        const parsed = updateQuickReplySchema.safeParse(req.body);

        if (!parsed.success) {
            const quickReply = await QuickReplyService.getById(
                req.user!.workspaceId,
                id
            );

            return res.status(400).render("pages/admin/quick-replies/edit", {
                user: req.user,
                quickReply,
                error: parsed.error.issues[0]?.message || "Datos inválidos."
            });
        }

        try {
            await QuickReplyService.update(
                req.user!.workspaceId,
                id,
                parsed.data
            );

            return res.redirect("/admin/quick-replies?success=updated");
        } catch (error) {
            const quickReply = await QuickReplyService.getById(
                req.user!.workspaceId,
                id
            );

            return res.status(400).render("pages/admin/quick-replies/edit", {
                user: req.user,
                quickReply,
                error:
                    error instanceof Error
                        ? error.message
                        : "No se pudo actualizar la respuesta."
            });
        }
    }

    static async setActive(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");
        const isActive = req.body?.isActive === "true";

        try {
            await QuickReplyService.setActive(
                req.user!.workspaceId,
                id,
                isActive
            );
        } catch {
            return res.redirect("/admin/quick-replies?error=update");
        }

        return res.redirect(
            `/admin/quick-replies?success=${isActive ? "activated" : "deactivated"}`
        );
    }
}
