import { Request, Response } from "express";
import { UserRole } from "@prisma/client";

import { prisma } from "../config/prisma";
import { ConversationService } from "../services/conversation.service";
import { LeadService } from "../services/lead.service";
import { getRequiredParam } from "../utils/request";

export class LeadConversationController {
    static mark(basePath: "/admin/conversations" | "/agent/conversations") {
        return async (req: Request, res: Response) => {
            const conversationId = getRequiredParam(req, "id");

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

                const existing = await prisma.lead.findFirst({
                    where: {
                        workspaceId: req.user!.workspaceId,
                        contactId: conversation.contactId
                    },
                    select: { id: true }
                });

                if (existing) {
                    return res.redirect(
                        `${basePath}/${conversationId}?error=lead_exists`
                    );
                }

                const contact = conversation.contact;
                const name = String(req.body?.name || "").trim();
                const phone = String(req.body?.phone || "").trim();
                const email = String(req.body?.email || "").trim();
                const interest = String(req.body?.interest || "").trim();
                const notes = String(req.body?.notes || "").trim();

                await LeadService.capture({
                    workspaceId: req.user!.workspaceId,
                    contactId: contact.id,
                    conversationId: conversation.id,
                    name:
                        name ||
                        contact.customName ||
                        contact.profileName ||
                        contact.phone,
                    phone: phone || contact.phone,
                    email: email || null,
                    interest: interest || null,
                    notes: notes || null,
                    source: "MANUAL_CHAT"
                });

                return res.redirect(
                    `${basePath}/${conversationId}?success=lead_created`
                );
            } catch {
                return res.redirect(
                    `${basePath}/${conversationId}?error=lead_create`
                );
            }
        };
    }
}
