import { Request, Response } from "express";

import { TagService } from "../services/tag.service";
import { getRequiredParam } from "../utils/request";
import {
    createTagSchema,
    updateTagSchema
} from "../validations/tag.validation";

export class AdminTagsController {
    private static wantsJson(req: Request): boolean {
        return Boolean(req.accepts("json") && !req.accepts("html"));
    }

    static async index(req: Request, res: Response) {
        const tags = await TagService.listTags(req.user!.workspaceId);

        if (AdminTagsController.wantsJson(req)) {
            return res.json({ tags: tags.map(({ id, name, color, createdAt }) => ({ id, name, color, createdAt })) });
        }

        return res.redirect("/panel/admin/tags");
    }

    static showCreate(req: Request, res: Response) {
        if (AdminTagsController.wantsJson(req)) return res.json({});
        return res.redirect("/panel/admin/tags?new=1");
    }

    static async create(req: Request, res: Response) {
        const parsed = createTagSchema.safeParse(req.body);

        if (!parsed.success) {
            if (req.is("application/json")) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos." });
            return res.status(400).render("pages/admin/tags/create", {
                user: req.user,
                error: parsed.error.issues[0]?.message || "Datos inválidos.",
                old: {
                    name: req.body.name || "",
                    color: req.body.color || "#1fa06a"
                }
            });
        }

        try {
            await TagService.createTag(req.user!.workspaceId, parsed.data);

            if (req.is("application/json")) return res.status(201).json({ ok: true });

            return res.redirect("/admin/tags?success=created");
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "No se pudo crear la etiqueta.";

            if (req.is("application/json")) return res.status(400).json({ error: message });

            return res.status(400).render("pages/admin/tags/create", {
                user: req.user,
                error: message,
                old: {
                    name: req.body.name || "",
                    color: req.body.color || "#1fa06a"
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

            if (AdminTagsController.wantsJson(req)) {
                return res.json({ tag: { id: tag.id, name: tag.name, color: tag.color } });
            }

            return res.redirect(`/panel/admin/tags?edit=${encodeURIComponent(id)}`);
        } catch {
            if (AdminTagsController.wantsJson(req)) return res.status(404).json({ error: "No se encontró la etiqueta." });
            return res.redirect("/admin/tags");
        }
    }

    static async update(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        const parsed = updateTagSchema.safeParse(req.body);

        if (!parsed.success) {
            if (req.is("application/json")) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos." });
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

            if (req.is("application/json")) return res.json({ ok: true });

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

            if (req.is("application/json")) return res.status(400).json({ error: message });

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
            if (AdminTagsController.wantsJson(req)) return res.status(400).json({ error: "No se pudo archivar la etiqueta." });
            // No detenemos el flujo visual por ahora.
        }

        if (AdminTagsController.wantsJson(req)) return res.json({ ok: true });

        return res.redirect("/admin/tags?success=deactivated");
    }
}
