import { Request, Response } from "express";
import { z } from "zod";

import { TemplateService } from "../services/template.service";
import { MessageService } from "../services/message.service";
import { sendTemplateMessageSchema } from "../validations/template-message.validation";
import { templateVariableShape } from "../utils/template";

export const sendBulkTemplateSchema = sendTemplateMessageSchema.extend({
    conversationIds: z.array(z.string().trim().min(1)).min(1).max(25)
});

export class ConversationBulkTemplateController {
    static async options(req: Request, res: Response) {
        const templates = await TemplateService.listApprovedTemplates(req.user!.workspaceId);
        return res.json({
            templates: templates.map(({ id, name, language, components }) => ({
                id,
                name,
                language,
                shape: templateVariableShape(components)
            }))
        });
    }

    static async send(req: Request, res: Response) {
        const parsed = sendBulkTemplateSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.issues[0]?.message || "Revisa los datos de envío." });
        }
        if (new Set(parsed.data.conversationIds).size !== parsed.data.conversationIds.length) {
            return res.status(400).json({ error: "Hay conversaciones repetidas en la selección." });
        }

        const template = await TemplateService.listApprovedTemplates(req.user!.workspaceId)
            .then((templates) => templates.find(({ id }) => id === parsed.data.templateId));
        if (!template) return res.status(400).json({ error: "La plantilla ya no está aprobada o no pertenece a este espacio." });

        const results: Array<{ conversationId: string; sent: boolean; error?: string }> = [];
        for (const conversationId of parsed.data.conversationIds) {
            try {
                await MessageService.sendTemplateMessage({
                    workspaceId: req.user!.workspaceId,
                    conversationId,
                    userId: req.user!.id,
                    role: req.user!.role,
                    input: {
                        templateId: template.id,
                        variable1: parsed.data.variable1,
                        variable2: parsed.data.variable2,
                        variable3: parsed.data.variable3,
                        headerVariable: parsed.data.headerVariable,
                        buttonVariable: parsed.data.buttonVariable
                    }
                });
                results.push({ conversationId, sent: true });
            } catch (error) {
                results.push({
                    conversationId,
                    sent: false,
                    error: error instanceof Error ? error.message : "No se pudo enviar la plantilla."
                });
            }
        }

        return res.json({
            total: results.length,
            sent: results.filter(({ sent }) => sent).length,
            failed: results.filter(({ sent }) => !sent).length,
            results
        });
    }
}
