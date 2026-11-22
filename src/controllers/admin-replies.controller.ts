import { Request, Response } from "express";

import { ContactOutcomeType, ReplyEffect } from "@prisma/client";
import { InteractiveReplyService } from "../services/interactive-reply.service";
import { OUTCOME_LABELS, OUTCOME_TYPES } from "../utils/outcome";
import { getRequiredParam } from "../utils/request";

/** Cómo se llama cada efecto en pantalla. */
const EFFECT_LABELS: Record<ReplyEffect, string> = {
    NONE: "Solo registra el resultado",
    PAUSE_ACCOUNT: "Pausa la cuenta (no se le escribe)",
    OPT_OUT: "Da de baja al contacto"
};

/**
 * Reglas que traducen lo que el deudor toca al resultado de gestión que ya
 * existe. Es la pantalla donde el despacho decide qué significa cada botón.
 */
export class AdminRepliesController {
    private static wantsJson(req: Request): boolean {
        return req.xhr || /application\/json/i.test(req.get("accept") || "");
    }

    static async index(req: Request, res: Response) {
        const rules = await InteractiveReplyService.list(req.user!.workspaceId);

        if (AdminRepliesController.wantsJson(req)) {
            return res.json({
                rules: rules.map(({ id, replyId, replyTitle, outcomeType, effect, note, isActive }) => ({ id, replyId, replyTitle, outcomeType, effect, note, isActive })),
                outcomeTypes: OUTCOME_TYPES,
                outcomeLabels: OUTCOME_LABELS,
                effects: Object.values(ReplyEffect),
                effectLabels: EFFECT_LABELS
            });
        }

        return res.redirect("/panel/admin/replies");
    }

    static async save(req: Request, res: Response) {
        const outcomeType = String(req.body?.outcomeType || "") as ContactOutcomeType;
        const effect = String(req.body?.effect || "NONE") as ReplyEffect;

        if (!Object.values(ContactOutcomeType).includes(outcomeType)) {
            if (req.is("application/json")) return res.status(400).json({ error: "Elige un resultado válido." });
            return res.redirect(
                `/admin/replies?error=${encodeURIComponent("Elige un resultado válido.")}`
            );
        }

        if (!Object.values(ReplyEffect).includes(effect)) {
            if (req.is("application/json")) return res.status(400).json({ error: "Elige un efecto válido." });
            return res.redirect(
                `/admin/replies?error=${encodeURIComponent("Elige un efecto válido.")}`
            );
        }

        try {
            await InteractiveReplyService.save(req.user!.workspaceId, {
                replyId: String(req.body?.replyId || ""),
                replyTitle: req.body?.replyTitle ? String(req.body.replyTitle) : null,
                outcomeType,
                effect,
                note: req.body?.note ? String(req.body.note) : null,
                isActive: true
            });
        } catch (error) {
            if (req.is("application/json")) return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo guardar." });
            return res.redirect(
                `/admin/replies?error=${encodeURIComponent(
                    error instanceof Error ? error.message : "No se pudo guardar."
                )}`
            );
        }

        if (req.is("application/json")) return res.json({ ok: true });
        return res.redirect("/admin/replies?success=saved");
    }

    static async createRecommended(req: Request, res: Response) {
        await InteractiveReplyService.createRecommended(req.user!.workspaceId);

        if (AdminRepliesController.wantsJson(req)) return res.json({ ok: true });

        return res.redirect("/admin/replies?success=created");
    }

    static async setActive(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");
        const value = req.body?.isActive;

        await InteractiveReplyService.setActive(
            req.user!.workspaceId,
            id,
            value === "1" || value === true || value === "true"
        );

        if (AdminRepliesController.wantsJson(req)) return res.json({ ok: true });

        return res.redirect("/admin/replies?success=saved");
    }

    static async remove(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        await InteractiveReplyService.remove(req.user!.workspaceId, id);

        if (AdminRepliesController.wantsJson(req)) return res.json({ ok: true });

        return res.redirect("/admin/replies?success=removed");
    }
}
