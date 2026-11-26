import { Request, Response } from "express";
import { AiMode, FeedbackValue } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { ConversationService } from "../services/conversation.service";
import { MessageService } from "../services/message.service";
import { TemplateService } from "../services/template.service";
import { QuickReplyService } from "../services/quick-reply.service";
import { SendPolicyService } from "../services/send-policy.service";
import { AiSettingsService } from "../services/ai/settings.service";
import { AiSuggestionService } from "../services/ai/suggestion.service";
import { GuidedFlowService } from "../services/guided-flow.service";
import { sharedContactDetailsFromPayload } from "../utils/shared-contact";
import { getRequiredParam } from "../utils/request";
import { TagService } from "../services/tag.service";
import { sendFreeTextMessageSchema } from "../validations/free-text-message.validation";
import {
    listRowsFromInput,
    sendInteractiveListSchema,
    sendInteractiveMessageSchema
} from "../validations/interactive-message.validation";
import {
    buildInteractiveButtons,
    buildInteractiveList
} from "../utils/interactive-message";
import { sendLocalMessageSchema } from "../validations/message.validation";
import { sendTemplateMessageSchema } from "../validations/template-message.validation";
import {
    formatDateTimeMX,
    formatDayLabelMX,
    formatTimeMX
} from "../utils/date";
import { templateVariableShape } from "../utils/template";
import { describeMetaError } from "../utils/meta-error";
import { WhatsAppCloudOperationsService } from "../services/whatsapp-cloud-operations.service";


export class AgentConversationsController {
    static async detailData(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");
        let conversation;

        try {
            conversation = await ConversationService.getConversationForAgent(
                req.user!.workspaceId,
                req.user!.id,
                conversationId
            );
        } catch {
            return res.status(404).json({ error: "conversation_not_found" });
        }

        if (conversation.unreadCount > 0) {
            const latestInbound = [...conversation.messages].reverse().find((message) => message.direction === "IN" && message.wamid);
            if (latestInbound?.wamid) WhatsAppCloudOperationsService.readMessage(req.user!.workspaceId, conversation.whatsappNumberId, latestInbound.wamid).catch(() => undefined);
        }
        await ConversationService.markAsRead(
            req.user!.workspaceId,
            conversation.id,
            req.user!.id
        );

        const [conversations, quickReplies, timezone] = await Promise.all([
            ConversationService.listForAgent(
                req.user!.workspaceId,
                req.user!.id,
                conversation.whatsappNumberId,
                {}
            ),
            QuickReplyService.listActive(req.user!.workspaceId),
            SendPolicyService.timezoneFor(req.user!.workspaceId)
        ]);

        const now = Date.now();
        const lastIncomingAt = conversation.lastIncomingMessageAt;

        return res.json({
            user: { name: req.user!.name },
            timezone,
            interactiveListsEnabled: Boolean(res.locals.interactiveListsEnabled),
            hasOpenWindow: Boolean(
                lastIncomingAt && now - new Date(lastIncomingAt).getTime() <= 24 * 60 * 60 * 1000
            ),
            conversation: {
                id: conversation.id,
                status: conversation.status,
                archivedAt: conversation.archivedAt,
                whatsappBlockedAt: conversation.whatsappBlockedAt,
                operationalStatus: conversation.operationalStatus,
                source: conversation.source,
                aiHandoffAt: conversation.aiHandoffAt,
                aiHandoffReason: conversation.aiHandoffReason,
                aiPausedAt: conversation.aiPausedAt,
                lastIncomingMessageAt: conversation.lastIncomingMessageAt,
                assignedUser: conversation.assignedUser
                    ? { name: conversation.assignedUser.name }
                    : null,
                whatsappNumber: conversation.whatsappNumber
                    ? {
                          displayName: conversation.whatsappNumber.displayName,
                          phoneNumber: conversation.whatsappNumber.phoneNumber
                      }
                    : null,
                contact: {
                    id: conversation.contact.id,
                    customName: conversation.contact.customName,
                    profileName: conversation.contact.profileName,
                    phone: conversation.contact.phone,
                    optOutAt: conversation.contact.optOutAt,
                    tags: conversation.contact.tags.map(({ tag }) => ({
                        id: tag.id,
                        name: tag.name,
                        color: tag.color
                    }))
                },
                messages: conversation.messages.map((message) => ({
                    id: message.id,
                    wamid: message.wamid,
                    direction: message.direction,
                    type: message.type,
                    status: message.status,
                    source: message.source,
                    body: message.type === "CONTACT"
                        ? sharedContactDetailsFromPayload(message.metaPayload) || message.body
                        : message.body,
                    mediaId: message.mediaId,
                    isInternalNote: message.isInternalNote,
                    aiSuggestionId: message.aiSuggestionId,
                    replyTitle: message.replyTitle,
                    replyId: message.replyId,
                    createdAt: message.createdAt,
                    errorText: describeMetaError(message.metaResponse)
                }))
            },
            conversations: conversations.map((item) => ({
                id: item.id,
                unreadCount: item.unreadCount,
                contactName:
                    item.contact.customName ||
                    item.contact.profileName ||
                    item.contact.phone,
                lastMessage: item.messages[0]
                    ? item.messages[0].body || `[${item.messages[0].type}]`
                    : "—"
            })),
            quickReplies: quickReplies.map(({ id, title, type, body, interactiveData }) => ({
                id,
                title,
                type,
                body,
                interactiveData
            })),
            offHoursNow: Boolean(res.locals.offHoursNow)
        });
    }

    static async listData(req: Request, res: Response) {
        const search = typeof req.query.search === "string" ? req.query.search : "";
        const status = typeof req.query.status === "string" ? req.query.status : "";
        const onlyUnread = req.query.unread === "1";
        const archivedOnly = req.query.archived === "1";
        const assigned = typeof req.query.assigned === "string" ? req.query.assigned : "";
        const tagId = typeof req.query.tagId === "string" ? req.query.tagId : "";
        const [conversations, tags] = await Promise.all([
            req.activeNumber
                ? ConversationService.listForAgent(
                      req.user!.workspaceId,
                      req.user!.id,
                      req.activeNumber.id,
                      {
                          search: search || undefined,
                          status: status || undefined,
                          assignedTo: assigned === "unassigned" ? null : undefined,
                          onlyUnread,
                          tagId: tagId || undefined,
                          archivedOnly
                      }
                  )
                : Promise.resolve([]),
            TagService.listTags(req.user!.workspaceId)
        ]);

        return res.json({
            conversations: conversations.map((conversation) => {
                const lastMessage = conversation.messages[0] ?? null;
                return {
                    id: conversation.id,
                    status: conversation.status,
                    operationalStatus: conversation.operationalStatus,
                    unreadCount: conversation.unreadCount,
                    archivedAt: conversation.archivedAt,
                    lastIncomingMessageAt: conversation.lastIncomingMessageAt?.toISOString() ?? null,
                    aiHandoffAt: conversation.aiHandoffAt,
                    assignedUser: conversation.assignedUser
                        ? { name: conversation.assignedUser.name }
                        : null,
                    contact: {
                        customName: conversation.contact.customName,
                        profileName: conversation.contact.profileName,
                        phone: conversation.contact.phone,
                        optOutAt: conversation.contact.optOutAt,
                        tags: conversation.contact.tags.map(({ tag }) => ({
                            id: tag.id,
                            name: tag.name,
                            color: tag.color
                        }))
                    },
                    lastMessage: lastMessage
                        ? {
                              body: lastMessage.body,
                              type: lastMessage.type,
                              timeLabel: res.locals.formatTimeMX(lastMessage.createdAt),
                              dateLabel: res.locals.formatDateMX(lastMessage.createdAt)
                          }
                        : null
                };
            }),
            tags: tags.map(({ id, name, color }) => ({ id, name, color })),
            filters: { search, status, onlyUnread, tagId, archivedOnly }
        });
    }

    static async index(req: Request, res: Response) {
        const search =
            typeof req.query.search === "string" ? req.query.search : "";
        const status =
            typeof req.query.status === "string" ? req.query.status : "";
        const onlyUnread = req.query.unread === "1";
        const assigned =
            typeof req.query.assigned === "string" ? req.query.assigned : "";

        const conversations = req.activeNumber
            ? await ConversationService.listForAgent(
                  req.user!.workspaceId,
                  req.user!.id,
                  req.activeNumber.id,
                  {
                      search: search || undefined,
                      status: status || undefined,
                      assignedTo:
                          assigned === "unassigned" ? null : undefined,
                      onlyUnread
                  }
              )
            : [];

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
        /** Borrador recién aprobado que hay que precargar en el compositor. */
        const draftId =
            typeof req.query.ai === "string" ? req.query.ai : "";
        const workspaceId = req.user!.workspaceId;

        /** Sin la capa encendida no se tocan las tablas de IA. */
        const aiOn = appConfig.ai.enabled;

        const [
            conversation,
            templates,
            quickReplies,
            aiSettings,
            aiSuggestion,
            aiDraftBody,
            aiConversation,
            guidedFlowRun
        ] = await Promise.all([
            ConversationService.getConversationForAgent(
                workspaceId,
                req.user!.id,
                conversationId
            ),
            TemplateService.listApprovedTemplates(workspaceId),
            QuickReplyService.listActive(workspaceId),
            aiOn
                ? AiSettingsService.get(workspaceId).catch(() =>
                      AiSettingsService.defaults()
                  )
                : Promise.resolve(AiSettingsService.defaults()),
            aiOn
                ? AiSuggestionService.latestPending(
                      workspaceId,
                      conversationId
                  ).catch(() => null)
                : Promise.resolve(null),
            aiOn && draftId
                ? AiSuggestionService.bodyForUse({
                      workspaceId,
                      conversationId,
                      suggestionId: draftId
                  }).catch(() => "")
                : Promise.resolve(""),
            aiOn
                ? AiSuggestionService.conversationSummary(
                      workspaceId,
                      conversationId
                  ).catch(() => null)
                : Promise.resolve(null),
            GuidedFlowService.panelForConversation(
                workspaceId,
                conversationId
            ).catch(() => null)
        ]);

        const existingLead = await prisma.lead.findFirst({
            where: {
                workspaceId,
                contactId: conversation.contactId
            },
            select: {
                id: true,
                name: true,
                phone: true,
                email: true,
                interest: true,
                notes: true
            }
        });

        await ConversationService.markAsRead(
            req.user!.workspaceId,
            conversation.id,
            req.user!.id
        );

        /** Recalcula los contadores de la página que se está pintando. */
        res.locals.unreadTotal = await ConversationService.countUnread({
            workspaceId: req.user!.workspaceId,
            whatsappNumberId: req.activeNumber?.id,
            assignedUserId: req.user!.id
        }).catch(() => res.locals.unreadTotal);
        res.locals.unassignedCount =
            await ConversationService.countUnassigned(
                req.user!.workspaceId
            ).catch(() => res.locals.unassignedCount);

        const timezone = await SendPolicyService.timezoneFor(
            req.user!.workspaceId
        );
        /** Lista para la columna izquierda de la bandeja de 3 paneles. */
        const conversations = await ConversationService.listForAgent(
            req.user!.workspaceId,
            req.user!.id,
            conversation.whatsappNumberId,
            {}
        );

        if (req.accepts("json") && !req.accepts("html")) return res.json({
            templates: templates.map(({ id, name, language, components }) => ({ id, name, language, components })),
            quickReplies: quickReplies.map(({ id, title, type, body, interactiveData }) => ({ id, title, type, body, interactiveData })),
            aiSuggestion: aiOn && aiSettings.enabled && aiSettings.mode === AiMode.SUGGEST && aiSuggestion ? { id: aiSuggestion.id, body: aiSuggestion.body, confidence: aiSuggestion.confidence, intent: aiSuggestion.intent, handoff: aiSuggestion.handoff, reason: aiSuggestion.reason, createdAt: aiSuggestion.createdAt } : null,
            aiSettings: { enabled: aiSettings.enabled, mode: aiSettings.mode, confidenceMin: aiSettings.confidenceMin },
            aiConversation,
            guidedFlowRun,
            existingLead,
            aiDraftBody,
            interactiveListsEnabled: Boolean(res.locals.interactiveListsEnabled),
            error: req.query.error || null,
            success: req.query.success || null,
            mediaError: typeof req.query.detail === "string" ? req.query.detail : null
        });

        return res.render("pages/agent/conversations/show", {
            conversations,
            user: req.user,
            conversation,
            templates,
            quickReplies,
            /** Solo se muestra la tarjeta si la IA está en modo sugerencia. */
            aiSuggestion:
                aiOn &&
                aiSettings.enabled &&
                aiSettings.mode === AiMode.SUGGEST
                    ? aiSuggestion
                    : null,
            aiConfidenceMin: aiSettings.confidenceMin,
            aiSettings,
            aiConversation,
            guidedFlowRun,
            existingLead,
            aiDraftBody,
            timezone,
            formatDateTimeMX,
            formatDayLabelMX,
            formatTimeMX,
            /** Para que el compositor muestre los campos que la plantilla pide. */
            templateVariableShape,
            success: req.query.success || null,
            error: req.query.error || null,
            mediaError:
                typeof req.query.detail === "string" ? req.query.detail : null
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

            /** Métrica de la fase 1: borrador aprobado y luego editado. */
            if (appConfig.ai.enabled) {
                await AiSuggestionService.noteManualSend({
                    workspaceId: req.user!.workspaceId,
                    conversationId,
                    body: parsed.data.body
                });
            }

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

    /** Reclama una conversación sin asignar. */
    static async claim(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        try {
            await ConversationService.claim(
                req.user!.workspaceId,
                conversationId,
                req.user!.id
            );
        } catch {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=claim`
            );
        }

        return res.redirect(`/agent/conversations/${conversationId}?success=claimed`);
    }

    /** Lista interactiva (menú de hasta 10 opciones), mismas reglas que el admin. */
    static async sendInteractiveList(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        const workspace = await prisma.workspace.findUnique({
            where: { id: req.user!.workspaceId },
            select: { interactiveListsEnabled: true }
        });

        if (!workspace?.interactiveListsEnabled) {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=lists_disabled`
            );
        }

        const parsed = sendInteractiveListSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=list`
            );
        }

        try {
            const message = buildInteractiveList({
                body: parsed.data.body,
                footer: parsed.data.footer,
                buttonLabel: parsed.data.buttonLabel,
                sectionTitle: parsed.data.sectionTitle,
                rows: listRowsFromInput(parsed.data)
            });

            await MessageService.sendInteractiveList({
                workspaceId: req.user!.workspaceId,
                conversationId,
                userId: req.user!.id,
                role: req.user!.role,
                message
            });

            return res.redirect(
                `/agent/conversations/${conversationId}?success=list`
            );
        } catch {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=list`
            );
        }
    }

    /** Valoración 👍/👎 al cerrar una conversación. */
    static async recordFeedback(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");
        const value =
            req.body?.value === "DOWN" ? FeedbackValue.DOWN : FeedbackValue.UP;

        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                workspaceId: req.user!.workspaceId,
                assignedUserId: req.user!.id
            },
            select: { id: true }
        });

        if (!conversation) {
            return res.redirect(
                `/agent/conversations/${conversationId}?error=feedback`
            );
        }

        await prisma.conversationFeedback.upsert({
            where: { conversationId },
            create: {
                workspaceId: req.user!.workspaceId,
                conversationId,
                value
            },
            update: { value }
        });

        return res.redirect(
            `/agent/conversations/${conversationId}?success=feedback`
        );
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
                caption: typeof req.body?.caption === "string" ? req.body.caption : null,
                voiceNote: req.body?.voiceNote === "true"
            });

            return res.redirect(
                `/agent/conversations/${conversationId}?success=media`
            );
        } catch (error) {
            const detail = encodeURIComponent(
                (error instanceof Error ? error.message : "Error desconocido").slice(0, 240)
            );
            return res.redirect(
                `/agent/conversations/${conversationId}?error=media&detail=${detail}`
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

    static async archive(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");
        try {
            await ConversationService.setArchived(req.user!.workspaceId, conversationId, true, req.user!.id, "AGENT");
            return res.json({ ok: true });
        } catch (error) {
            return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo archivar." });
        }
    }

    static async unarchive(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");
        try {
            await ConversationService.setArchived(req.user!.workspaceId, conversationId, false, req.user!.id, "AGENT");
            return res.json({ ok: true });
        } catch (error) {
            return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo desarchivar." });
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
