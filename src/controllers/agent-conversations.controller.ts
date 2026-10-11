import { Request, Response } from "express";

import { ConversationService } from "../services/conversation.service";
import { MessageService } from "../services/message.service";
import { TemplateService } from "../services/template.service";
import { getRequiredParam } from "../utils/request";
import { sendFreeTextMessageSchema } from "../validations/free-text-message.validation";
import { sendLocalMessageSchema } from "../validations/message.validation";
import { sendTemplateMessageSchema } from "../validations/template-message.validation";
import {
    formatDateTimeMX,
    formatDayLabelMX,
    formatTimeMX
} from "../utils/date";


export class AgentConversationsController {
    static async index(req: Request, res: Response) {
        const conversations = await ConversationService.listForAgent(
            req.user!.workspaceId,
            req.user!.id
        );

        return res.render("pages/agent/conversations/index", {
            user: req.user,
            conversations,
            success: req.query.success || null,
            error: req.query.error || null
        });
    }

    static async show(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        const [conversation, templates] = await Promise.all([
            ConversationService.getConversationForAgent(
                req.user!.workspaceId,
                req.user!.id,
                conversationId
            ),
            TemplateService.listApprovedTemplates(req.user!.workspaceId)
        ]);

        return res.render("pages/agent/conversations/show", {
            user: req.user,
            conversation,
            templates,
            formatDateTimeMX,
            formatDayLabelMX,
            formatTimeMX,
            success: req.query.success || null,
            error: req.query.error || null
        });
    }

    static async sendFreeTextMessage(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        const parsed = sendFreeTextMessageSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=free_text`
            );
        }

        try {
            await MessageService.sendFreeTextMessage({
                workspaceId: req.user!.workspaceId,
                conversationId,
                userId: req.user!.id,
                role: req.user!.role,
                input: parsed.data
            });

            return res.redirect(
                `/agent/conversations/${conversationId}?success=free_text`
            );
        } catch {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=free_text`
            );
        }
    }

    static async sendLocalMessage(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        const parsed = sendLocalMessageSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=message`
            );
        }

        try {
            await MessageService.sendLocalMessage({
                workspaceId: req.user!.workspaceId,
                conversationId,
                userId: req.user!.id,
                role: req.user!.role,
                input: parsed.data
            });

            return res.redirect(
                `/agent/conversations/${conversationId}?success=message`
            );
        } catch {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=message`
            );
        }
    }

    static async sendTemplateMessage(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        const parsed = sendTemplateMessageSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=template`
            );
        }

        try {
            await MessageService.sendTemplateMessage({
                workspaceId: req.user!.workspaceId,
                conversationId,
                userId: req.user!.id,
                role: req.user!.role,
                input: parsed.data
            });

            return res.redirect(
                `/agent/conversations/${conversationId}?success=template`
            );
        } catch {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=template`
            );
        }
    }

    static async deleteMessage(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");
        const messageId = getRequiredParam(req, "messageId");

        try {
            await MessageService.deleteMessage({
                workspaceId: req.user!.workspaceId,
                conversationId,
                messageId,
                actor: { id: req.user!.id, role: req.user!.role }
            });

            return res.redirect(
                `/agent/conversations/${conversationId}?success=message`
            );
        } catch {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=message`
            );
        }
    }

    static async close(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        try {
            await ConversationService.closeConversation(
                req.user!.workspaceId,
                conversationId,
                req.user!.id,
                "AGENT"
            );

            return res.redirect(
                `/agent/conversations/${conversationId}?success=close`
            );
        } catch {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=close`
            );
        }
    }
}
