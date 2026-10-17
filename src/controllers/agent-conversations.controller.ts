import { Request, Response } from "express";

import { ConversationService } from "../services/conversation.service";
import { MessageService } from "../services/message.service";
import { TemplateService } from "../services/template.service";
import { QuickReplyService } from "../services/quick-reply.service";
import { ContactOutcomeService } from "../services/contact-outcome.service";
import { SendPolicyService } from "../services/send-policy.service";
import { startOfTodayIn } from "../utils/date";
import {
    OUTCOME_BADGE_CLASSES,
    OUTCOME_LABELS,
    OUTCOME_SHORT_LABELS,
    OUTCOME_TYPES,
    daysOverdue,
    formatAmount,
    isOpenPromise
} from "../utils/outcome";
import { getRequiredParam } from "../utils/request";
import { sendFreeTextMessageSchema } from "../validations/free-text-message.validation";
import { sendInteractiveMessageSchema } from "../validations/interactive-message.validation";
import { buildInteractiveButtons } from "../utils/interactive-message";
import { sendLocalMessageSchema } from "../validations/message.validation";
import { sendTemplateMessageSchema } from "../validations/template-message.validation";
import {
    formatDateTimeMX,
    formatDayLabelMX,
    formatTimeMX,
    formatWaitingTime
} from "../utils/date";
import { templateVariableShape } from "../utils/template";


export class AgentConversationsController {
    static async index(req: Request, res: Response) {
        const search =
            typeof req.query.search === "string" ? req.query.search : "";
        const status =
            typeof req.query.status === "string" ? req.query.status : "";
        const onlyUnread = req.query.unread === "1";

        const conversations = await ConversationService.listForAgent(
            req.user!.workspaceId,
            req.user!.id,
            req.activeNumber?.id,
            {
                search: search || undefined,
                status: status || undefined,
                onlyUnread
            }
        );

        return res.render("pages/agent/conversations/index", {
            user: req.user,
            conversations,
            search,
            status,
            onlyUnread,
            success: req.query.success || null,
            error: req.query.error || null
        });
    }

    static async show(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        const [conversation, templates, quickReplies] = await Promise.all([
            ConversationService.getConversationForAgent(
                req.user!.workspaceId,
                req.user!.id,
                conversationId
            ),
            TemplateService.listApprovedTemplates(req.user!.workspaceId),
            QuickReplyService.listActive(req.user!.workspaceId)
        ]);

        await ConversationService.markAsRead(
            req.user!.workspaceId,
            conversation.id
        );

        const timezone = await SendPolicyService.timezoneFor(
            req.user!.workspaceId
        );
        const attempts = await ContactOutcomeService.attemptsFor(
            req.user!.workspaceId,
            [conversation.contactId]
        );

        return res.render("pages/agent/conversations/show", {
            user: req.user,
            conversation,
            templates,
            quickReplies,
            outcomeAttempts: attempts.get(conversation.contactId) ?? {
                attempts: 0,
                hasInbound: false,
                lastInboundAt: null
            },
            outcomeLabels: OUTCOME_LABELS,
            outcomeBadgeClasses: OUTCOME_BADGE_CLASSES,
            outcomeTypes: OUTCOME_TYPES,
            shortLabels: OUTCOME_SHORT_LABELS,
            isOpenPromise,
            formatAmount,
            daysLate: daysOverdue(
                conversation.contact.outcomeDueAt,
                startOfTodayIn(timezone)
            ),
            formatDateTimeMX,
            formatDayLabelMX,
            formatTimeMX,
            formatWaitingTime,
            /** Para que el compositor muestre los campos que la plantilla pide. */
            templateVariableShape,
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

    /** Botones dentro de la ventana de 24 horas (mismas reglas que el admin). */
    static async sendInteractiveMessage(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        const parsed = sendInteractiveMessageSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=interactive`
            );
        }

        try {
            const message = buildInteractiveButtons({
                body: parsed.data.body,
                footer: parsed.data.footer,
                titles: [parsed.data.button1, parsed.data.button2, parsed.data.button3]
            });

            await MessageService.sendInteractiveMessage({
                workspaceId: req.user!.workspaceId,
                conversationId,
                userId: req.user!.id,
                role: req.user!.role,
                message
            });

            return res.redirect(
                `/agent/conversations/${conversationId}?success=interactive`
            );
        } catch {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=interactive`
            );
        }
    }

    static async sendMediaMessage(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        if (!req.file) {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=media`
            );
        }

        try {
            await MessageService.sendMediaMessage({
                workspaceId: req.user!.workspaceId,
                conversationId,
                userId: req.user!.id,
                role: req.user!.role,
                file: {
                    path: req.file.path,
                    originalname: req.file.originalname,
                    mimetype: req.file.mimetype,
                    size: req.file.size
                },
                caption: typeof req.body?.caption === "string" ? req.body.caption : null
            });

            return res.redirect(
                `/agent/conversations/${conversationId}?success=media`
            );
        } catch {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=media`
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
