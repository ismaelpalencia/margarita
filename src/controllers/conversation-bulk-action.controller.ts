import { Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../config/prisma";
import { ConversationService } from "../services/conversation.service";
import { MessageService } from "../services/message.service";

const bulkActionSchema = z.object({
    conversationIds: z.array(z.string().trim().min(1)).min(1).max(25),
    action: z.enum(["assign", "read", "note", "close"]),
    agentId: z.string().trim().optional().nullable(),
    body: z.string().trim().optional()
});

export const conversationBulkActionSchema = bulkActionSchema;

export class ConversationBulkActionController {
    static async run(req: Request, res: Response) {
        const parsed = bulkActionSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.issues[0]?.message || "Revisa la selección." });
        }
        if (new Set(parsed.data.conversationIds).size !== parsed.data.conversationIds.length) {
            return res.status(400).json({ error: "Hay conversaciones repetidas en la selección." });
        }
        if (parsed.data.action === "assign" && req.user!.role !== UserRole.ADMIN) {
            return res.status(403).json({ error: "Solo un administrador puede asignar conversaciones." });
        }
        if (parsed.data.action === "note" && (!parsed.data.body || parsed.data.body.length > 4000)) {
            return res.status(400).json({ error: "La nota debe tener entre 1 y 4000 caracteres." });
        }

        const me = req.user!.role === UserRole.AGENT
            ? await prisma.user.findUnique({
                  where: { id: req.user!.id },
                  select: { allowedNumberIds: true }
              })
            : null;
        const allowedNumberIds = me?.allowedNumberIds ?? [];
        const conversations = await prisma.conversation.findMany({
            where: {
                workspaceId: req.user!.workspaceId,
                id: { in: parsed.data.conversationIds },
                ...(req.user!.role === UserRole.AGENT
                    ? {
                          assignedUserId: req.user!.id,
                          ...(allowedNumberIds.length > 0
                              ? { whatsappNumberId: { in: allowedNumberIds } }
                              : {})
                      }
                    : {})
            },
            select: { id: true }
        });

        if (conversations.length !== parsed.data.conversationIds.length) {
            return res.status(400).json({ error: "Algunas conversaciones ya no están disponibles para ti." });
        }

        const results: Array<{ conversationId: string; ok: boolean; error?: string }> = [];
        for (const conversation of conversations) {
            try {
                if (parsed.data.action === "assign") {
                    await ConversationService.assignConversation(
                        req.user!.workspaceId,
                        conversation.id,
                        parsed.data.agentId || null,
                        req.user!.id
                    );
                } else if (parsed.data.action === "read") {
                    await ConversationService.markAsRead(
                        req.user!.workspaceId,
                        conversation.id,
                        req.user!.id
                    );
                } else if (parsed.data.action === "note") {
                    await MessageService.sendLocalMessage({
                        workspaceId: req.user!.workspaceId,
                        conversationId: conversation.id,
                        userId: req.user!.id,
                        role: req.user!.role,
                        input: { body: parsed.data.body! }
                    });
                } else {
                    await ConversationService.closeConversation(
                        req.user!.workspaceId,
                        conversation.id,
                        req.user!.id,
                        req.user!.role === UserRole.ADMIN ? "ADMIN" : "AGENT"
                    );
                }
                results.push({ conversationId: conversation.id, ok: true });
            } catch (error) {
                results.push({
                    conversationId: conversation.id,
                    ok: false,
                    error: error instanceof Error ? error.message : "No se pudo completar la acción."
                });
            }
        }

        return res.json({
            updated: results.filter(({ ok }) => ok).length,
            failed: results.filter(({ ok }) => !ok).length,
            results
        });
    }
}
