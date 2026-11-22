import { Request, Response } from "express";

import { QuickReplyService } from "../services/quick-reply.service";
import { getRequiredParam } from "../utils/request";
import {
    createQuickReplySchema,
    updateQuickReplySchema
} from "../validations/quick-reply.validation";

export class AdminQuickRepliesController {
    private static wantsJson(req: Request): boolean {
        return Boolean(req.accepts("json") && !req.accepts("html"));
    }

    static async index(req: Request, res: Response) {
        const quickReplies = await QuickReplyService.listAll(
            req.user!.workspaceId
        );

        if (AdminQuickRepliesController.wantsJson(req)) {
            return res.json({ quickReplies: quickReplies.map(({ id, title, body, isActive, updatedAt }) => ({ id, title, body, isActive, updatedAt })) });
        }
        return res.redirect("/panel/admin/quick-replies");
    }

    static async create(req: Request, res: Response) {
        const parsed = createQuickReplySchema.safeParse(req.body);

        if (!parsed.success) {
            if (req.is("application/json")) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos." });
            return res.redirect("/admin/quick-replies?error=validation");
        }

        try {
            await QuickReplyService.create(
                req.user!.workspaceId,
                req.user!.id,
                parsed.data
            );

            if (req.is("application/json")) return res.status(201).json({ ok: true });

            return res.redirect("/admin/quick-replies?success=created");
        } catch (error) {
            if (req.is("application/json")) return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo crear la respuesta rápida." });
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

            if (AdminQuickRepliesController.wantsJson(req)) {
                return res.json({ quickReply: { id: quickReply.id, title: quickReply.title, body: quickReply.body, isActive: quickReply.isActive } });
            }

            return res.redirect(`/panel/admin/quick-replies?edit=${encodeURIComponent(id)}`);
        } catch {
            if (AdminQuickRepliesController.wantsJson(req)) return res.status(404).json({ error: "No se encontró la respuesta rápida." });
            return res.redirect("/admin/quick-replies");
        }
    }

    static async update(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        const parsed = updateQuickReplySchema.safeParse(req.body);

        if (!parsed.success) {
            if (req.is("application/json")) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos." });
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

            if (req.is("application/json")) return res.json({ ok: true });

            return res.redirect("/admin/quick-replies?success=updated");
        } catch (error) {
            if (req.is("application/json")) return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo actualizar la respuesta." });
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
        const isActive = req.body?.isActive === "true" || req.body?.isActive === true;

        try {
            await QuickReplyService.setActive(
                req.user!.workspaceId,
                id,
                isActive
            );
        } catch {
            if (AdminQuickRepliesController.wantsJson(req)) return res.status(400).json({ error: "No se pudo cambiar el estado." });
            return res.redirect("/admin/quick-replies?error=update");
        }

        if (AdminQuickRepliesController.wantsJson(req)) return res.json({ ok: true });

        return res.redirect(
            `/admin/quick-replies?success=${isActive ? "activated" : "deactivated"}`
        );
    }
}
