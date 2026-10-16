import { Request, Response } from "express";

import { ContactOutcomeType, ReplyEffect } from "@prisma/client";
import { InteractiveReplyService } from "../services/interactive-reply.service";
import { OUTCOME_BADGE_CLASSES, OUTCOME_LABELS, OUTCOME_TYPES } from "../utils/outcome";
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
    static async index(req: Request, res: Response) {
        const rules = await InteractiveReplyService.list(req.user!.workspaceId);

        return res.render("pages/admin/replies/index", {
            user: req.user,
            rules,
            outcomeTypes: OUTCOME_TYPES,
            outcomeLabels: OUTCOME_LABELS,
            outcomeBadgeClasses: OUTCOME_BADGE_CLASSES,
            effects: Object.values(ReplyEffect),
            effectLabels: EFFECT_LABELS,
            success: req.query.success || null,
            error: req.query.error || null
        });
    }

    static async save(req: Request, res: Response) {
        const outcomeType = String(req.body?.outcomeType || "") as ContactOutcomeType;
        const effect = String(req.body?.effect || "NONE") as ReplyEffect;

        if (!Object.values(ContactOutcomeType).includes(outcomeType)) {
            return res.redirect(
                `/admin/replies?error=${encodeURIComponent("Elige un resultado válido.")}`
            );
        }

        if (!Object.values(ReplyEffect).includes(effect)) {
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
            return res.redirect(
                `/admin/replies?error=${encodeURIComponent(
                    error instanceof Error ? error.message : "No se pudo guardar."
                )}`
            );
        }

        return res.redirect("/admin/replies?success=saved");
    }

    static async createRecommended(req: Request, res: Response) {
        await InteractiveReplyService.createRecommended(req.user!.workspaceId);

        return res.redirect("/admin/replies?success=created");
    }

    static async setActive(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        await InteractiveReplyService.setActive(
            req.user!.workspaceId,
            id,
            req.body?.isActive === "1"
        );

        return res.redirect("/admin/replies?success=saved");
    }

    static async remove(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        await InteractiveReplyService.remove(req.user!.workspaceId, id);

        return res.redirect("/admin/replies?success=removed");
    }
}
