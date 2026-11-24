import { Request, Response } from "express";
import { AiMode, FeedbackValue } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { ConversationService } from "../services/conversation.service";
import { MessageService } from "../services/message.service";
import { TemplateService } from "../services/template.service";
import { UserService } from "../services/user.service";
import { QuickReplyService } from "../services/quick-reply.service";
import { SendPolicyService } from "../services/send-policy.service";
import { AiSettingsService } from "../services/ai/settings.service";
import { AiSuggestionService } from "../services/ai/suggestion.service";
import { GuidedFlowService } from "../services/guided-flow.service";
import { monthKeyIn, startOfMonthIn } from "../utils/date";
import { sharedContactDetailsFromPayload } from "../utils/shared-contact";
import { NumberUsageService } from "../services/number-usage.service";
import { templateVariableShape } from "../utils/template";
import { getRequiredParam } from "../utils/request";
import { TagService } from "../services/tag.service";
import { sendFreeTextMessageSchema } from "../validations/free-text-message.validation";
import { sendLocalMessageSchema } from "../validations/message.validation";
import { sendTemplateMessageSchema } from "../validations/template-message.validation";
import {
    listRowsFromInput,
    sendInteractiveListSchema,
    sendInteractiveMessageSchema
} from "../validations/interactive-message.validation";
import {
    buildInteractiveButtons,
    buildInteractiveList
} from "../utils/interactive-message";
import {
    formatDateTimeMX,
    formatDayLabelMX,
    formatTimeMX
} from "../utils/date";
import { describeMetaError } from "../utils/meta-error";
import { WhatsAppCloudOperationsService } from "../services/whatsapp-cloud-operations.service";

export class AdminConversationsController {
    static async detailData(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");
        let conversation;
        try {
            conversation = await ConversationService.getConversationForAdmin(
                req.user!.workspaceId,
                conversationId,
                { includeDeleted: req.query.deleted === "1" }
            );
        } catch {
            return res.status(404).json({ error: "conversation_not_found" });
        }

        if (conversation.unreadCount > 0) {
            const latestInbound = [...conversation.messages].reverse().find((message) => message.direction === "IN" && message.wamid);
            if (latestInbound?.wamid) WhatsAppCloudOperationsService.readMessage(req.user!.workspaceId, conversation.whatsappNumberId, latestInbound.wamid).catch(() => undefined);
        }
        await ConversationService.markAsRead(req.user!.workspaceId, conversation.id);
        const [quickReplies, timezone] = await Promise.all([
            QuickReplyService.listActive(req.user!.workspaceId),
            SendPolicyService.timezoneFor(req.user!.workspaceId)
        ]);
        const lastIncomingAt = conversation.lastIncomingMessageAt;

        return res.json({
            timezone,
            offHoursNow: Boolean(res.locals.offHoursNow),
            interactiveListsEnabled: Boolean(res.locals.interactiveListsEnabled),
            hasOpenWindow: Boolean(lastIncomingAt && Date.now() - new Date(lastIncomingAt).getTime() <= 24 * 60 * 60 * 1000),
            conversation: {
                id: conversation.id,
                status: conversation.status,
                whatsappBlockedAt: conversation.whatsappBlockedAt,
                operationalStatus: conversation.operationalStatus,
                source: conversation.source,
                aiHandoffAt: conversation.aiHandoffAt,
                aiHandoffReason: conversation.aiHandoffReason,
                aiPausedAt: conversation.aiPausedAt,
                lastIncomingMessageAt: conversation.lastIncomingMessageAt,
                assignedUser: conversation.assignedUser ? { name: conversation.assignedUser.name } : null,
                whatsappNumber: conversation.whatsappNumber ? { displayName: conversation.whatsappNumber.displayName, phoneNumber: conversation.whatsappNumber.phoneNumber } : null,
                contact: {
                    id: conversation.contact.id,
                    customName: conversation.contact.customName,
                    profileName: conversation.contact.profileName,
                    phone: conversation.contact.phone,
                    optOutAt: conversation.contact.optOutAt,
                    tags: conversation.contact.tags.map(({ tag }) => ({ id: tag.id, name: tag.name, color: tag.color }))
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
                    deletedAt: message.deletedAt,
                    errorText: describeMetaError(message.metaResponse)
                }))
            },
            quickReplies: quickReplies.map(({ id, title, type, body, interactiveData }) => ({ id, title, type, body, interactiveData }))
        });
    }

    static async listData(req: Request, res: Response) {
        const status = typeof req.query.status === "string" ? req.query.status : "";
        const search = typeof req.query.search === "string" ? req.query.search : "";
        const assigned = typeof req.query.assigned === "string" ? req.query.assigned : "";
        const onlyUnread = req.query.unread === "1";
        const tagId = typeof req.query.tagId === "string" ? req.query.tagId : "";
        const [conversations, tags, agents] = await Promise.all([
            ConversationService.listForAdmin(
                req.user!.workspaceId,
                req.activeNumber?.id,
                {
                    status: status || undefined,
                    search: search || undefined,
                    assignedTo:
                        assigned === "unassigned"
                            ? null
                            : assigned === "mine"
                              ? req.user!.id
                              : undefined,
                    onlyUnread,
                    tagId: tagId || undefined
                }
            ),
            TagService.listTags(req.user!.workspaceId),
            UserService.listActiveAgents(req.user!.workspaceId)
        ]);

        return res.json({
            conversations: conversations.map((conversation) => {
                const lastMessage = conversation.messages[0] ?? null;
                return {
                    id: conversation.id,
                    status: conversation.status,
                    operationalStatus: conversation.operationalStatus,
                    unreadCount: conversation.unreadCount,
                    aiHandoffAt: conversation.aiHandoffAt,
                    assignedUser: conversation.assignedUser
                        ? { id: conversation.assignedUser.id, name: conversation.assignedUser.name }
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
                              timeLabel: res.locals.formatTimeMX(lastMessage.createdAt)
                          }
                        : null
                };
            }),
            tags: tags.map(({ id, name, color }) => ({ id, name, color })),
            agents: agents.map(({ id, name, status }) => ({ id, name, status })),
            filters: { search, status, assigned, onlyUnread, tagId }
        });
    }

    static async index(req: Request, res: Response) {
        const status =
            typeof req.query.status === "string" ? req.query.status : "";
        const search =
            typeof req.query.search === "string" ? req.query.search : "";
        const assigned =
            typeof req.query.assigned === "string" ? req.query.assigned : "";
        const onlyUnread = req.query.unread === "1";

        const conversations = await ConversationService.listForAdmin(
            req.user!.workspaceId,
            req.activeNumber?.id,
            {
                status: status || undefined,
                search: search || undefined,
                assignedTo:
                    assigned === "unassigned"
                        ? null
                        : assigned === "mine"
                          ? req.user!.id
                          : undefined,
                onlyUnread
            }
        );

        /**
         * Al empezar el día, cuál número conviene usar para las conversaciones
         * nuevas: el que tiene más tramo libre este mes.
         */
        const timezone = await SendPolicyService.timezoneFor(
            req.user!.workspaceId
        );
        const usage = await NumberUsageService.forWorkspace(
            req.user!.workspaceId,
            startOfMonthIn(timezone)
        ).catch(() => []);
        const suggested = NumberUsageService.suggested(usage);

        return res.render("pages/admin/conversations/index", {
            user: req.user,
            conversations,
            suggestedNumber: suggested,
            usageMonth: monthKeyIn(timezone),
            status,
            search,
            assigned,
            onlyUnread,
            success: req.query.success || null,
            error: req.query.error || null
        });
    }

    static async show(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");
        const includeDeleted = req.query.deleted === "1";
        /** Borrador recién aprobado que hay que precargar en el compositor. */
        const draftId =
            typeof req.query.ai === "string" ? req.query.ai : "";
        const workspaceId = req.user!.workspaceId;

        /**
         * Las consultas de IA solo se hacen si la instalación tiene la capa
         * encendida. Así una base sin la migración de IA sigue sirviendo
         * conversaciones exactamente como antes.
         */
        const aiOn = appConfig.ai.enabled;

        const [
            conversation,
            agents,
            templates,
            quickReplies,
            aiSettings,
            aiSuggestion,
            aiDraftBody,
            aiConversation,
            guidedFlowRun
        ] = await Promise.all([
            ConversationService.getConversationForAdmin(
                workspaceId,
                conversationId,
                { includeDeleted }
            ),
            UserService.listActiveAgents(workspaceId),
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

        /** Abrir el hilo quita el aviso de no leídos. */
        await ConversationService.markAsRead(
            req.user!.workspaceId,
            conversation.id
        );

        /** Recalcula los contadores de la página que se está pintando. */
        res.locals.unreadTotal = await ConversationService.countUnread({
            workspaceId: req.user!.workspaceId,
            whatsappNumberId: req.activeNumber?.id,
            assignedUserId:
                req.user!.role === "AGENT" ? req.user!.id : undefined
        }).catch(() => res.locals.unreadTotal);
        res.locals.unassignedCount =
            await ConversationService.countUnassigned(
                req.user!.workspaceId
            ).catch(() => res.locals.unassignedCount);

        const timezone = await SendPolicyService.timezoneFor(
            req.user!.workspaceId
        );
        /** Lista para la columna izquierda de la bandeja de 3 paneles. */
        const conversations = await ConversationService.listForAdmin(
            req.user!.workspaceId,
            conversation.whatsappNumberId,
            {}
        );

        if (req.accepts("json") && !req.accepts("html")) return res.json({
            agents: agents.map(({ id, name, status }) => ({ id, name, status })),
            templates: templates.map(({ id, name, language, components }) => ({ id, name, language, components })),
            quickReplies: quickReplies.map(({ id, title, type, body, interactiveData }) => ({ id, title, type, body, interactiveData })),
            aiSuggestion: aiOn && aiSettings.enabled && aiSettings.mode === AiMode.SUGGEST && aiSuggestion ? { id: aiSuggestion.id, body: aiSuggestion.body, confidence: aiSuggestion.confidence, intent: aiSuggestion.intent, handoff: aiSuggestion.handoff, reason: aiSuggestion.reason, createdAt: aiSuggestion.createdAt } : null,
            aiSettings: { enabled: aiSettings.enabled, mode: aiSettings.mode, confidenceMin: aiSettings.confidenceMin },
            aiConversation,
            guidedFlowRun,
            existingLead,
            aiDraftBody,
            showDeleted: includeDeleted,
            interactiveListsEnabled: Boolean(res.locals.interactiveListsEnabled),
            error: req.query.error || null,
            success: req.query.success || null,
            mediaError: typeof req.query.detail === "string" ? req.query.detail : null
        });

        return res.render("pages/admin/conversations/show", {
            user: req.user,
            conversation,
            conversations,
            agents,
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
            showDeleted: includeDeleted,
            timezone,
            formatDateTimeMX,
            formatDayLabelMX,
            formatTimeMX,
            /** Para que el compositor muestre los campos que la plantilla pide. */
            templateVariableShape,
            error: req.query.error || null,
            success: req.query.success || null,
            mediaError:
                typeof req.query.detail === "string" ? req.query.detail : null
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

            /**
             * Métrica de la fase 1: si la persona había aprobado un borrador
             * y cambió el texto, cuenta como editado. Nunca bloquea el envío.
             */
            if (appConfig.ai.enabled) {
                await AiSuggestionService.noteManualSend({
                    workspaceId: req.user!.workspaceId,
                    conversationId,
                    body: parsed.data.body
                });
            }

            return res.redirect(
                `/admin/conversations/${conversationId}?success=free_text`
            );
        } catch {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=free_text`
            );
        }
    }

    static async sendMediaMessage(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        if (!req.file) {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=media`
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
                `/admin/conversations/${conversationId}?success=media`
            );
        } catch (error) {
            const detail = encodeURIComponent(
                (error instanceof Error ? error.message : "Error desconocido").slice(0, 240)
            );
            return res.redirect(
                `/admin/conversations/${conversationId}?error=media&detail=${detail}`
            );
        }
    }

    /**
     * Botones dentro de la ventana de 24 horas.
     *
     * No abre conversaciones: si la ventana está cerrada, el servicio lo
     * rechaza y se regresa con el motivo.
     */
    static async sendInteractiveMessage(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        const parsed = sendInteractiveMessageSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=interactive`
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
                `/admin/conversations/${conversationId}?success=interactive`
            );
        } catch {
            /**
             * Un límite de Meta (botón muy largo, ventana cerrada, error de la
             * API) se muestra como aviso en el hilo, no como un 500.
             */
            return res.redirect(
                `/admin/conversations/${conversationId}?error=interactive`
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
                `/admin/conversations/${conversationId}?error=claim`
            );
        }

        return res.redirect(`/admin/conversations/${conversationId}?success=claimed`);
    }

    /** Lista interactiva (menú de hasta 10 opciones). */
    static async sendInteractiveList(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");

        const workspace = await prisma.workspace.findUnique({
            where: { id: req.user!.workspaceId },
            select: { interactiveListsEnabled: true }
        });

        if (!workspace?.interactiveListsEnabled) {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=lists_disabled`
            );
        }

        const parsed = sendInteractiveListSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=list`
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
                `/admin/conversations/${conversationId}?success=list`
            );
        } catch {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=list`
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
                workspaceId: req.user!.workspaceId
            },
            select: { id: true }
        });

        if (!conversation) {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=feedback`
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
            `/admin/conversations/${conversationId}?success=feedback`
        );
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
                contactId,
                ConversationService.requireActiveNumberId(req)
            );

            return res.redirect(`/admin/conversations/${conversation.id}`);
        } catch {
            return res.redirect("/admin/contacts?error=conversation");
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

            /**
             * Desde el dashboard se oculta y se regresa ahí mismo; desde el
             * hilo, al hilo. Solo se acepta la ruta interna del dashboard.
             */
            const fromDashboard = req.body?.redirectTo === "/admin/dashboard";

            return res.redirect(
                fromDashboard
                    ? "/admin/dashboard?success=hidden"
                    : `/admin/conversations/${conversationId}?success=deleted`
            );
        } catch {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=delete`
            );
        }
    }

    static async restoreMessage(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");
        const messageId = getRequiredParam(req, "messageId");

        try {
            await MessageService.restoreMessage({
                workspaceId: req.user!.workspaceId,
                conversationId,
                messageId,
                actor: { id: req.user!.id, role: req.user!.role }
            });

            return res.redirect(
                `/admin/conversations/${conversationId}?deleted=1&success=restored`
            );
        } catch {
            return res.redirect(
                `/admin/conversations/${conversationId}?deleted=1&error=restore`
            );
        }
    }

    static async purge(req: Request, res: Response) {
        const conversationId = getRequiredParam(req, "id");
        const confirmation =
            typeof req.body?.confirm === "string" ? req.body.confirm.trim() : "";

        /**
         * El borrado definitivo exige escribir la palabra: no basta con
         * un clic ni con el diálogo del navegador.
         */
        if (confirmation.toUpperCase() !== "BORRAR") {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=confirm`
            );
        }

        try {
            await ConversationService.purgeMessages(
                req.user!.workspaceId,
                conversationId,
                req.user!.id
            );

            return res.redirect(
                `/admin/conversations/${conversationId}?success=purged`
            );
        } catch {
            return res.redirect(
                `/admin/conversations/${conversationId}?error=purge`
            );
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
