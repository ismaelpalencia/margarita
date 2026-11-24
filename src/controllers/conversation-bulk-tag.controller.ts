import { Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../config/prisma";
import { ContactService } from "../services/contact.service";
import { TagService } from "../services/tag.service";

const bulkTagSchema = z.object({
    conversationIds: z.array(z.string().trim().min(1)).min(1).max(25),
    tagIds: z.array(z.string().trim().min(1)).min(1).max(20),
    mode: z.enum(["add", "replace", "remove"])
});

export const conversationBulkTagSchema = bulkTagSchema;

export class ConversationBulkTagController {
    static async update(req: Request, res: Response) {
        const parsed = bulkTagSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.issues[0]?.message || "Revisa la selección." });
        }
        if (new Set(parsed.data.conversationIds).size !== parsed.data.conversationIds.length) {
            return res.status(400).json({ error: "Hay conversaciones repetidas en la selección." });
        }

        const tags = await TagService.listTags(req.user!.workspaceId);
        const validTagIds = new Set(tags.map((tag) => tag.id));
        const requestedTagIds = [...new Set(parsed.data.tagIds)].filter((id) => validTagIds.has(id));
        if (requestedTagIds.length === 0) {
            return res.status(400).json({ error: "La etiqueta ya no está activa." });
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
            select: { id: true, contactId: true }
        });

        if (conversations.length !== parsed.data.conversationIds.length) {
            return res.status(400).json({ error: "Algunas conversaciones ya no están disponibles para ti." });
        }

        const results: Array<{ conversationId: string; ok: boolean; error?: string }> = [];
        for (const conversation of conversations) {
            try {
                const contact = await ContactService.getContactById(
                    req.user!.workspaceId,
                    conversation.contactId
                );
                const current = new Set(contact.tags.map(({ tagId }) => tagId));
                const next =
                    parsed.data.mode === "replace"
                        ? new Set(requestedTagIds)
                        : parsed.data.mode === "add"
                          ? new Set([...current, ...requestedTagIds])
                          : new Set([...current].filter((id) => !requestedTagIds.includes(id)));

                await ContactService.setTags(
                    req.user!.workspaceId,
                    conversation.contactId,
                    [...next]
                );
                results.push({ conversationId: conversation.id, ok: true });
            } catch (error) {
                results.push({
                    conversationId: conversation.id,
                    ok: false,
                    error: error instanceof Error ? error.message : "No se pudo actualizar."
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
