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
    static async form(req: Request, res: Response) {
        return res.render("pages/admin/ai/import", {
            user: req.user,
            error: req.query.error || null,
            source: "",
            instructions: ""
        });
    }

    static async analyze(req: Request, res: Response) {
        const parsed = formSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).render("pages/admin/ai/import", {
                user: req.user,
                error: parsed.error.issues[0]?.message || "Datos inválidos.",
                source: String(req.body?.source || ""),
                instructions: String(req.body?.instructions || "")
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
                instructions: parsed.data.instructions
            });
        }
    }

    static async apply(req: Request, res: Response) {
        const importId = getRequiredParam(req, "id");

        try {
            await BusinessImportService.apply({
                workspaceId: req.user!.workspaceId,
                userId: req.user!.id,
                importId
            });

            return res.redirect("/admin/ai?success=import");
        } catch {
            return res.redirect("/admin/ai/import?error=apply");
        }
    }
}
