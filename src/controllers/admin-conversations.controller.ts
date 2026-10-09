import { Request, Response } from "express";

import { ConversationService } from "../services/conversation.service";
import { MessageService } from "../services/message.service";
import { TemplateService } from "../services/template.service";
import { UserService } from "../services/user.service";
import { getRequiredParam } from "../utils/request";
import { sendFreeTextMessageSchema } from "../validations/free-text-message.validation";
import { sendLocalMessageSchema } from "../validations/message.validation";
import { sendTemplateMessageSchema } from "../validations/template-message.validation";
import { formatDateTimeMX, formatTimeMX } from "../utils/date";

export class AdminConversationsController {
    static async index(req: Request, res: Response) {
        const conversations = await ConversationService.listForAdmin(
            req.user!.workspaceId
        );

        return res.render("pages/admin/conversations/index", {
            user: req.user,
            conversations,
            status: typeof req.query.status === "string" ? req.query.status : "",
            success: req.query.success || null,
            error: req.query.error || null
        });
    }

    static async show(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        const [conversation, agents, templates] = await Promise.all([
            ConversationService.getConversationForAdmin(
                req.user!.workspaceId,
                conversationId
            ),
            UserService.listActiveAgents(req.user!.workspaceId),
            TemplateService.listApprovedTemplates(req.user!.workspaceId)
        ]);

        return res.render("pages/admin/conversations/show", {
            user: req.user,
            conversation,
            agents,
            templates,
            formatDateTimeMX,
            formatTimeMX,
            error: req.query.error || null,
            success: req.query.success || null
        });
    }

    static async sendFreeTextMessage(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        const parsed = sendFreeTextMessageSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=free_text`
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
                `/admin/conversations/${conversationId}?success=free_text`
            );
        } catch {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=free_text`
            );
        }
    }

    static async sendLocalMessage(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        const parsed = sendLocalMessageSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=message`
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
                `/admin/conversations/${conversationId}?success=message`
            );
        } catch {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=message`
            );
        }
    }

    static async sendTemplateMessage(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        const parsed = sendTemplateMessageSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=template`
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
                `/admin/conversations/${conversationId}?success=template`
            );
        } catch {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=template`
            );
        }
    }

    static async openFromContact(req: Request, res: Response) {
        const contactId = getRequiredParam(req, "contactId");

        try {
            const conversation = await ConversationService.openFromContact(
                req.user!.workspaceId,
                contactId
            );

            return res.redirect(`/admin/conversations/${conversation.id}`);
        } catch {
            return res.redirect("/admin/contacts?error=conversation");
        }
    }

    static async assign(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        try {
            const agentId =
                typeof req.body.agentId === "string" &&
                req.body.agentId.trim() !== ""
                    ? req.body.agentId
                    : null;

            await ConversationService.assignConversation(
                req.user!.workspaceId,
                conversationId,
                agentId,
                req.user!.id
            );

            return res.redirect(
                `/admin/conversations/${conversationId}?success=assign`
            );
        } catch {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=assign`
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
                "ADMIN"
            );

            return res.redirect(
                `/admin/conversations/${conversationId}?success=close`
            );
        } catch {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=close`
            );
        }
    }

    static async reopen(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        try {
            await ConversationService.reopenConversation(
                req.user!.workspaceId,
                conversationId
            );

            return res.redirect(
                `/admin/conversations/${conversationId}?success=reopen`
            );
        } catch {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=reopen`
            );
        }
    }
}