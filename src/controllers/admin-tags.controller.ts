import { Request, Response } from "express";

import { TagService } from "../services/tag.service";
import { getRequiredParam } from "../utils/request";
import {
    createTagSchema,
    updateTagSchema
} from "../validations/tag.validation";

export class AdminTagsController {
    static async index(req: Request, res: Response) {
        const tags = await TagService.listTags(req.user!.workspaceId);

        return res.render("pages/admin/tags/index", {
            user: req.user,
            tags,
            success: req.query.success || null
        });
    }

    static showCreate(req: Request, res: Response) {
        return res.render("pages/admin/tags/create", {
            user: req.user,
            error: null,
            old: {
                name: "",
                color: "#10b981"
            }
        });
    }

    static async create(req: Request, res: Response) {
        const parsed = createTagSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).render("pages/admin/tags/create", {
                user: req.user,
                error: parsed.error.issues[0]?.message || "Datos inválidos.",
                old: {
                    name: req.body.name || "",
                    color: req.body.color || "#10b981"
                }
            });
        }

        try {
            await TagService.createTag(req.user!.workspaceId, parsed.data);

            return res.redirect("/admin/tags?success=created");
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "No se pudo crear la etiqueta.";

            return res.status(400).render("pages/admin/tags/create", {
                user: req.user,
                error: message,
                old: {
                    name: req.body.name || "",
                    color: req.body.color || "#10b981"
                }
            });
        }
    }

    static async showEdit(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            const tag = await TagService.getTagById(
                req.user!.workspaceId,
                id
            );

            return res.render("pages/admin/tags/edit", {
                user: req.user,
                tag,
                error: null
            });
        } catch {
            return res.redirect("/admin/tags");
        }
    }

    static async update(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        const parsed = updateTagSchema.safeParse(req.body);

        if (!parsed.success) {
            const tag = await TagService.getTagById(
                req.user!.workspaceId,
                id
            );

            return res.status(400).render("pages/admin/tags/edit", {
                user: req.user,
                tag,
                error: parsed.error.issues[0]?.message || "Datos inválidos."
            });
        }

        try {
            await TagService.updateTag(
                req.user!.workspaceId,
                id,
                parsed.data
            );

            return res.redirect("/admin/tags?success=updated");
        } catch (error) {
            const tag = await TagService.getTagById(
                req.user!.workspaceId,
                id
            );

            const message =
                error instanceof Error
                    ? error.message
                    : "No se pudo actualizar la etiqueta.";

            return res.status(400).render("pages/admin/tags/edit", {
                user: req.user,
                tag,
                error: message
            });
        }
    }

    static async deactivate(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            await TagService.deactivateTag(req.user!.workspaceId, id);
        } catch {
            // No detenemos el flujo visual por ahora.
        }

        return res.redirect("/admin/tags?success=deactivated");
    }
}