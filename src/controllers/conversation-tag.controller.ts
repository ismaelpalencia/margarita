import { Request, Response } from "express";
import { UserRole } from "@prisma/client";

import { ContactService } from "../services/contact.service";
import { ConversationService } from "../services/conversation.service";
import { getRequiredParam } from "../utils/request";

export class ConversationTagController {
    static async update(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");
        const raw = req.body?.tagIds;
        const tagIds = Array.isArray(raw)
            ? raw.map(String).filter(Boolean)
            : typeof raw === "string" && raw
              ? [raw]
              : [];

        try {
            const conversation =
                req.user!.role === UserRole.AGENT
                    ? await ConversationService.getConversationForAgent(
                          req.user!.workspaceId,
                          req.user!.id,
                          conversationId
                      )
                    : await ConversationService.getConversationForAdmin(
                          req.user!.workspaceId,
                          conversationId
                      );

            const contact = await ContactService.setTags(
                req.user!.workspaceId,
                conversation.contactId,
                tagIds
            );

            return res.json({
                ok: true,
                tags: contact.tags.map(({ tag }) => ({
                    id: tag.id,
                    name: tag.name,
                    color: tag.color
                }))
            });
        } catch (error) {
            return res.status(400).json({
                error:
                    error instanceof Error
                        ? error.message
                        : "No se pudieron actualizar las etiquetas."
            });
        }
    }
}
