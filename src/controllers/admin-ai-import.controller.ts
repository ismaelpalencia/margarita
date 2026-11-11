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
        return res.render("pages/admin/ai/import", {
            user: req.user,
            error: req.query.error || null,
            source: "",
            instructions: "",
            drafts: await AdminAiImportController.draftsFor(
                req.user!.workspaceId
            ),
            lastReplace: await BusinessImportService.lastReplace(
                req.user!.workspaceId
            ),
            success: req.query.success || null
        });
    }

    static async analyze(req: Request, res: Response) {
        const parsed = formSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).render("pages/admin/ai/import", {
                user: req.user,
                error: parsed.error.issues[0]?.message || "Datos inválidos.",
                source: String(req.body?.source || ""),
                instructions: String(req.body?.instructions || ""),
                drafts: await AdminAiImportController.draftsFor(
                    req.user!.workspaceId
                )
            });
        }

        try {
            const result = await BusinessImportService.analyze({
                workspaceId: req.user!.workspaceId,
                userId: req.user!.id,
                source: parsed.data.source,
                instructions: parsed.data.instructions
            });

            return res.render("pages/admin/ai/import-preview", {
                user: req.user,
                importId: result.importId,
                data: result.data
            });
        } catch (error) {
            return res.status(400).render("pages/admin/ai/import", {
                user: req.user,
                error:
                    error instanceof BusinessImportError
                        ? error.message
                        : "No se pudo analizar el documento. Intenta de nuevo.",
                source: parsed.data.source,
                instructions: parsed.data.instructions,
                drafts: await AdminAiImportController.draftsFor(
                    req.user!.workspaceId
                )
            });
        }
    }

    static async showDraft(req: Request, res: Response) {
        const importId = getRequiredParam(req, "id");

        try {
            const draft = await BusinessImportService.getDraft(
                req.user!.workspaceId,
                importId
            );

            return res.render("pages/admin/ai/import-preview", {
                user: req.user,
                importId: draft.record.id,
                data: draft.data,
                success: req.query.success || null
            });
        } catch {
            return res.redirect("/admin/ai/import?error=draft");
        }
    }

    static async editDraft(req: Request, res: Response) {
        const importId = getRequiredParam(req, "id");

        try {
            const draft = await BusinessImportService.getDraft(
                req.user!.workspaceId,
                importId
            );

            return res.render("pages/admin/ai/import-edit", {
                user: req.user,
                importId: draft.record.id,
                resultJson: JSON.stringify(draft.record.result, null, 2),
                error: req.query.error || null
            });
        } catch {
            return res.redirect("/admin/ai/import?error=draft");
        }
    }

    static async updateDraft(req: Request, res: Response) {
        const importId = getRequiredParam(req, "id");
        const resultJson = String(req.body?.result || "");

        let parsedJson: unknown;

        try {
            parsedJson = JSON.parse(resultJson);
        } catch {
            return res.status(400).render("pages/admin/ai/import-edit", {
                user: req.user,
                importId,
                resultJson,
                error: "El JSON no es válido. Revisa comas, llaves y comillas."
            });
        }

        try {
            await BusinessImportService.updateDraft({
                workspaceId: req.user!.workspaceId,
                importId,
                result: parsedJson
            });

            return res.redirect(
                `/admin/ai/import/${importId}?success=saved`
            );
        } catch (error) {
            return res.status(400).render("pages/admin/ai/import-edit", {
                user: req.user,
                importId,
                resultJson,
                error:
                    error instanceof BusinessImportError
                        ? error.message
                        : "No se pudo guardar el borrador."
            });
        }
    }

    static async undo(req: Request, res: Response) {
        try {
            await BusinessImportService.undoLastReplace({
                workspaceId: req.user!.workspaceId,
                userId: req.user!.id
            });

            return res.redirect("/admin/ai/import?success=undo");
        } catch {
            return res.redirect("/admin/ai/import?error=undo");
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

            return res.redirect("/admin/ai/import?success=applied");
        } catch {
            return res.redirect("/admin/ai/import?error=apply");
        }
    }
}
