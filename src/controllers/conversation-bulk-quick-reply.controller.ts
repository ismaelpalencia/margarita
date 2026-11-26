import { Request, Response } from "express";
import { z } from "zod";

import { QuickReplyService } from "../services/quick-reply.service";
import { MessageService } from "../services/message.service";
import { buildInteractiveButtons, buildInteractiveList } from "../utils/interactive-message";

export const sendBulkQuickReplySchema = z.object({
    conversationIds: z.array(z.string().trim().min(1)).min(1).max(25),
    quickReplyId: z.string().trim().min(1)
}).superRefine(({ conversationIds }, context) => {
    if (new Set(conversationIds).size !== conversationIds.length) {
        context.addIssue({ code: "custom", path: ["conversationIds"], message: "Hay conversaciones repetidas en la selección." });
    }
});

function objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

export class ConversationBulkQuickReplyController {
    static async options(req: Request, res: Response) {
        const replies = await QuickReplyService.listActive(req.user!.workspaceId);
        return res.json({
            quickReplies: replies
                .filter((reply) => reply.type !== "LIST" || Boolean(res.locals.interactiveListsEnabled))
                .map(({ id, title, type, body }) => ({ id, title, type, body }))
        });
    }

    static async send(req: Request, res: Response) {
        const parsed = sendBulkQuickReplySchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.issues[0]?.message || "Revisa la selección." });
        }
        const reply = (await QuickReplyService.listActive(req.user!.workspaceId))
            .find(({ id }) => id === parsed.data.quickReplyId);
        if (!reply) return res.status(400).json({ error: "La respuesta rápida ya no está activa o no pertenece a este espacio." });
        if (reply.type === "LIST" && !res.locals.interactiveListsEnabled) {
            return res.status(400).json({ error: "Las listas interactivas están apagadas para este espacio." });
        }

        const data = objectValue(reply.interactiveData);
        const results: Array<{ conversationId: string; sent: boolean; error?: string }> = [];
        for (const conversationId of parsed.data.conversationIds) {
            try {
                if (reply.type === "TEXT") {
                    await MessageService.sendFreeTextMessage({
                        workspaceId: req.user!.workspaceId,
                        conversationId,
                        userId: req.user!.id,
                        role: req.user!.role,
                        input: { body: reply.body }
                    });
                } else if (reply.type === "BUTTONS") {
                    const buttons = Array.isArray(data["buttons"]) ? data["buttons"].filter((item): item is string => typeof item === "string") : [];
                    const message = buildInteractiveButtons({ body: reply.body, footer: typeof data["footer"] === "string" ? data["footer"] : "", titles: buttons });
                    await MessageService.sendInteractiveMessage({
                        workspaceId: req.user!.workspaceId,
                        conversationId,
                        userId: req.user!.id,
                        role: req.user!.role,
                        message
                    });
                } else {
                    const rows = Array.isArray(data["rows"]) ? data["rows"].map((item) => objectValue(item)) : [];
                    const message = buildInteractiveList({
                        body: reply.body,
                        footer: typeof data["footer"] === "string" ? data["footer"] : "",
                        buttonLabel: typeof data["buttonLabel"] === "string" ? data["buttonLabel"] : "",
                        sectionTitle: typeof data["sectionTitle"] === "string" ? data["sectionTitle"] : "Opciones",
                        rows: rows.map((row) => ({
                            title: typeof row["title"] === "string" ? row["title"] : "",
                            description: typeof row["description"] === "string" ? row["description"] : ""
                        }))
                    });
                    await MessageService.sendInteractiveList({
                        workspaceId: req.user!.workspaceId,
                        conversationId,
                        userId: req.user!.id,
                        role: req.user!.role,
                        message
                    });
                }
                results.push({ conversationId, sent: true });
            } catch (error) {
                results.push({
                    conversationId,
                    sent: false,
                    error: error instanceof Error ? error.message : "No se pudo enviar la respuesta rápida."
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
