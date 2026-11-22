import { Request, Response } from "express";
import { z } from "zod";

import { getRequiredParam } from "../utils/request";
import {
    BusinessImportError,
    BusinessImportService
} from "../services/ai/business-import.service";

const formSchema = z.object({
    source: z
        .string()
        .trim()
        .min(30, "Pega un documento con al menos 30 caracteres.")
        .max(30000, "El documento no puede pasar de 30,000 caracteres."),
    instructions: z
        .string()
        .trim()
        .max(2000, "Las instrucciones no pueden pasar de 2,000 caracteres.")
        .optional()
        .default("")
});

export class AdminAiImportController {
    private static async draftsFor(workspaceId: string) {
        const drafts = await BusinessImportService.listDrafts(workspaceId);

        return drafts.map((draft) => ({
            id: draft.id,
            createdAt: draft.createdAt,
            summary: draft.summary as {
                businessName?: string;
                knowledgeCount?: number;
                flowsCount?: number;
            } | null
        }));
    }

    static async form(req: Request, res: Response) {
        if (req.accepts("json") && !req.accepts("html")) return res.json({ drafts: await AdminAiImportController.draftsFor(req.user!.workspaceId), lastReplace: await BusinessImportService.lastReplace(req.user!.workspaceId) });
        return res.redirect("/panel/admin/ai/import");
    }

    static async analyze(req: Request, res: Response) {
        const parsed = formSchema.safeParse(req.body);

        if (!parsed.success) {
            if (req.accepts("json")) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos." });
            return res.redirect("/panel/admin/ai/import?error=validation");
        }

        try {
            const result = await BusinessImportService.analyze({
                workspaceId: req.user!.workspaceId,
                userId: req.user!.id,
                source: parsed.data.source,
                instructions: parsed.data.instructions
            });

            if (req.accepts("json")) return res.json({ importId: result.importId });
            return res.redirect(`/panel/admin/ai/import/${result.importId}`);
        } catch (error) {
            if (req.accepts("json")) return res.status(400).json({ error: error instanceof BusinessImportError ? error.message : "No se pudo analizar el documento. Intenta de nuevo." });
            return res.redirect("/panel/admin/ai/import?error=analyze");
        }
    }

    static async showDraft(req: Request, res: Response) {
        const importId = getRequiredParam(req, "id");

        try {
            const draft = await BusinessImportService.getDraft(
                req.user!.workspaceId,
                importId
            );

            if (req.accepts("json") && !req.accepts("html")) return res.json({ importId: draft.record.id, data: draft.data, success: req.query.success || null });
            return res.redirect(`/panel/admin/ai/import/${draft.record.id}`);
        } catch {
            return res.redirect("/panel/admin/ai/import?error=draft");
        }
    }

    static async editDraft(req: Request, res: Response) {
        const importId = getRequiredParam(req, "id");

        try {
            const draft = await BusinessImportService.getDraft(
                req.user!.workspaceId,
                importId
            );

            if (req.accepts("json") && !req.accepts("html")) return res.json({ importId: draft.record.id, result: draft.record.result });
            return res.redirect(`/panel/admin/ai/import/${draft.record.id}/edit`);
        } catch {
            return res.redirect("/panel/admin/ai/import?error=draft");
        }
    }

    static async updateDraft(req: Request, res: Response) {
        const importId = getRequiredParam(req, "id");
        const resultJson = String(req.body?.result || "");

        let parsedJson: unknown;

        try {
            parsedJson = JSON.parse(resultJson);
        } catch {
            if (req.accepts("json")) return res.status(400).json({ error: "El JSON no es válido. Revisa comas, llaves y comillas." });
            return res.redirect(
                `/panel/admin/ai/import/${importId}/edit?error=json`
            );
        }

        try {
            await BusinessImportService.updateDraft({
                workspaceId: req.user!.workspaceId,
                importId,
                result: parsedJson
            });

            if (req.accepts("json")) return res.json({ ok: true });

            return res.redirect(
                `/panel/admin/ai/import/${importId}?success=saved`
            );
        } catch (error) {
            if (req.accepts("json")) return res.status(400).json({ error: error instanceof BusinessImportError ? error.message : "No se pudo guardar el borrador." });
            return res.redirect(
                `/panel/admin/ai/import/${importId}/edit?error=save`
            );
        }
    }

    static async undo(req: Request, res: Response) {
        try {
            await BusinessImportService.undoLastReplace({
                workspaceId: req.user!.workspaceId,
                userId: req.user!.id
            });

            return res.redirect("/panel/admin/ai/import?success=undo");
        } catch {
            return res.redirect("/panel/admin/ai/import?error=undo");
        }
    }

    static async apply(req: Request, res: Response) {
        const importId = getRequiredParam(req, "id");
        const mode = req.body?.mode === "replace" ? "replace" : "merge";

        try {
            await BusinessImportService.apply({
                workspaceId: req.user!.workspaceId,
                userId: req.user!.id,
                importId,
                mode
            });

            return res.redirect("/panel/admin/ai/import?success=applied");
        } catch {
            return res.redirect("/panel/admin/ai/import?error=apply");
        }
    }
}
