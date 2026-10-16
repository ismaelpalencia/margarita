import {
    CampaignRecipientStatus,
    ConversationOperationalStatus,
    ConversationSource,
    ConversationStatus,
    LogLevel,
    LogModule,
    MessageDirection,
    MessageSource,
    MessageStatus,
    MessageType,
    Prisma
} from "@prisma/client";

import { prisma } from "../config/prisma";
import { appConfig } from "../config/app.config";
import {
    MetaWebhookMessage,
    MetaWebhookPayload,
    MetaWebhookQualityValue,
    MetaWebhookTemplateStatusValue,
    MetaWebhookValue,
    MetaWebhookStatus
} from "../types/meta-webhook";
import { contactPhoneFields, normalizeMexicanPhone } from "../utils/phone";
import { describeMetaError } from "../utils/meta-error";
import { matchesOptOutKeyword } from "../utils/opt-out";
import { emitToWorkspace } from "../sockets";
import { AssignmentService } from "./assignment.service";
import { LogService } from "./log.service";
import { prefetchMedia } from "./media.service";
import { WhatsAppNumberService } from "./whatsapp-number.service";
import { AccountHealthService } from "./account-health.service";

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Lo que se guarda de un mensaje entrante. Los tres últimos campos sólo
 * aparecen cuando la persona tocó un botón o eligió de una lista.
 */
type ParsedIncomingMessage = {
    type: MessageType;
    body: string;
    mediaId: string | null;
    mimeType: string | null;
    interactiveType?: string | null;
    replyId?: string | null;
    replyTitle?: string | null;
};

export class MetaWebhookHandlerService {
    // Se usa cuando un evento de la cola agotó sus reintentos.
    static async logProcessorFailure(params: {
        webhookEventId: string;
        attempts: number;
        error: string;
    }) {
        await LogService.create({
            level: LogLevel.ERROR,
            module: LogModule.WEBHOOK,
            action: "WEBHOOK_EVENT_FAILED",
            message:
                "Un evento de webhook agotó sus reintentos y no pudo procesarse.",
            payload: params
        });
    }

    static async handleIncomingPayload(payload: MetaWebhookPayload) {
        const entries = payload.entry || [];

        for (const entry of entries) {
            const changes = entry.changes || [];

            for (const change of changes) {
                /**
                 * Además de los mensajes, Meta avisa por aquí cuando una
                 * plantilla cambia de estado o cuando baja la calidad de
                 * un número. Son los avisos que antes había que ir a
                 * buscar al panel de Meta.
                 */
                if (change.field === "message_template_status_update") {
                    await AccountHealthService.handleTemplateStatus(
                        entry.id,
                        (change.value || {}) as MetaWebhookTemplateStatusValue
                    );

                    continue;
                }

                if (change.field === "phone_number_quality_update") {
                    await AccountHealthService.handleQualityUpdate(
                        (change.value || {}) as MetaWebhookQualityValue
                    );

                    continue;
                }

                if (change.field !== "messages") {
                    continue;
                }

                const value = change.value as MetaWebhookValue | undefined;

                if (!value) {
                    continue;
                }

                const phoneNumberId = value.metadata?.phone_number_id;

                if (!phoneNumberId) {
                    await LogService.create({
                        level: LogLevel.WARN,
                        module: LogModule.WEBHOOK,
                        action: "WEBHOOK_MISSING_PHONE_NUMBER_ID",
                        message: "Webhook recibido sin phone_number_id.",
                        payload: value
                    });

                    continue;
                }

                /**
                 * El número es lo primero que se identifica: de él sale el
                 * workspace y también a qué hilo pertenece el mensaje.
                 */
                const number = await WhatsAppNumberService.getByPhoneNumberId(
                    phoneNumberId
                );

                if (!number) {
                    await LogService.create({
                        level: LogLevel.WARN,
                        module: LogModule.WEBHOOK,
                        action: "WEBHOOK_UNKNOWN_PHONE_NUMBER_ID",
                        message: "Webhook recibido para un phone_number_id no configurado.",
                        payload: {
                            phoneNumberId
                        }
                    });

                    continue;
                }

                const contacts = value.contacts || [];
                const messages = value.messages || [];
                const statuses = value.statuses || [];

                for (const message of messages) {
                    await this.handleIncomingMessage({
                        workspaceId: number.whatsappAccount.workspaceId,
                        whatsappNumberId: number.id,
                        message,
                        profileName: contacts.find(
                            (contact) => contact.wa_id === message.from
                        )?.profile?.name
                    });
                }

                for (const status of statuses) {
                    await this.handleStatusUpdate({
                        workspaceId: number.whatsappAccount.workspaceId,
                        status
                    });
                }
            }
        }
    }

    private static async handleIncomingMessage(params: {
        workspaceId: string;
        whatsappNumberId: string;
        message: MetaWebhookMessage;
        profileName?: string;
    }) {
        const { workspaceId, whatsappNumberId, message, profileName } = params;

        if (!message.id || !message.from) {
            await LogService.create({
                workspaceId,
                level: LogLevel.WARN,
                module: LogModule.WEBHOOK,
                action: "WEBHOOK_INCOMING_MESSAGE_INVALID",
                message: "Mensaje entrante sin id o from.",
                payload: message
            });

            return;
        }

        const existingMessage = await prisma.message.findUnique({
            where: {
                wamid: message.id
            }
        });

        if (existingMessage) {
            return;
        }

        const normalizedPhone = normalizeMexicanPhone(message.from);
        const phoneFields = contactPhoneFields(normalizedPhone);

        const contact = await prisma.contact.upsert({
            where: {
                workspaceId_phoneHash: {
                    workspaceId,
                    phoneHash: phoneFields.phoneHash
                }
            },
            update: {
                profileName: profileName || undefined,
                lastSeenAt: new Date(),
                isActive: true
            },
            create: {
                workspaceId,
                ...phoneFields,
                profileName: profileName || null,
                lastSeenAt: new Date(),
                isActive: true
            }
        });

        const conversation = await this.getOrCreateConversationForIncomingMessage({
            workspaceId,
            whatsappNumberId,
            contactId: contact.id
        });

        const messageDate = message.timestamp
            ? new Date(Number(message.timestamp) * 1000)
            : new Date();

        const parsed = this.parseIncomingMessage(message);

        const savedMessage = await prisma.message.create({
            data: {
                workspaceId,
                conversationId: conversation.id,
                direction: MessageDirection.IN,
                type: parsed.type,
                status: MessageStatus.DELIVERED,
                source: MessageSource.WEBHOOK,
                wamid: message.id,
                body: parsed.body,
                mediaId: parsed.mediaId,
                mimeType: parsed.mimeType,
                interactiveType: parsed.interactiveType ?? null,
                replyId: parsed.replyId ?? null,
                replyTitle: parsed.replyTitle ?? null,
                metaPayload: toPrismaJson(message),
                createdAt: messageDate
            }
        });

        /**
         * La respuesta queda en la bitácora con su identificador y su texto.
         * El texto va en el payload (que se guarda cifrado); el mensaje del
         * registro no lo repite, para no dejar contenido en claro.
         */
        if (parsed.replyId) {
            await LogService.create({
                workspaceId,
                level: LogLevel.INFO,
                module: LogModule.MESSAGE,
                action: "INTERACTIVE_REPLY",
                message:
                    parsed.interactiveType === "list_reply"
                        ? "El cliente eligió una opción de una lista."
                        : "El cliente respondió con un botón.",
                payload: {
                    wamid: message.id,
                    messageId: savedMessage.id,
                    conversationId: conversation.id,
                    replyId: parsed.replyId,
                    replyTitle: parsed.replyTitle,
                    interactiveType: parsed.interactiveType
                }
            });
        }

        const updatedConversation = await prisma.conversation.update({
            where: {
                id: conversation.id
            },
            data: {
                status: ConversationStatus.OPEN,
                operationalStatus: conversation.assignedUserId
                    ? ConversationOperationalStatus.IN_PROGRESS
                    : ConversationOperationalStatus.UNASSIGNED,
                lastIncomingMessageAt: messageDate,
                lastMessageAt: messageDate,
                closedAt: null,
                /** Cada mensaje entrante suma uno al contador de no leídos. */
                unreadCount: {
                    increment: 1
                }
            }
        });

        let finalConversation = updatedConversation;

        if (!updatedConversation.assignedUserId) {
            finalConversation = await AssignmentService.assignLeastBusyAgent({
                workspaceId,
                conversationId: updatedConversation.id
            });
        }

        const optedOut = await this.applyOptOutIfRequested({
            workspaceId,
            contactId: contact.id,
            alreadyOptedOutAt: contact.optOutAt,
            body: parsed.body
        });

        emitToWorkspace(workspaceId, "conversation:message", {
            conversationId: conversation.id,
            assignedUserId: finalConversation.assignedUserId,
            contactOptedOut: optedOut,
            contact: {
                id: contact.id,
                name:
                    contact.customName || contact.profileName || contact.phone,
                phone: contact.phone
            },
            whatsappNumberId,
            message: {
                id: savedMessage.id,
                wamid: savedMessage.wamid,
                direction: savedMessage.direction,
                type: savedMessage.type,
                status: savedMessage.status,
                source: savedMessage.source,
                body: savedMessage.body,
                createdAt: savedMessage.createdAt.toISOString()
            }
        });

        /**
         * Las imágenes se descargan de inmediato (son livianas y casi
         * siempre se terminan mirando). El audio y los documentos se
         * descargan cuando alguien los abre. Nunca lanza: un fallo queda
         * registrado y se reintenta al abrir el archivo.
         */
        if (parsed.type === MessageType.IMAGE) {
            void prefetchMedia(savedMessage);
        }

        await LogService.create({
            workspaceId,
            level: LogLevel.INFO,
            module: LogModule.WEBHOOK,
            action: "WEBHOOK_INCOMING_MESSAGE_SAVED",
            message: "Mensaje entrante guardado correctamente.",
            payload: {
                wamid: message.id,
                from: message.from,
                normalizedPhone,
                type: message.type,
                conversationId: conversation.id
            }
        });
    }

    /**
     * Baja automática: si el cliente escribió la palabra clave (por
     * defecto STOP), el contacto queda dado de baja y no se le vuelve a
     * escribir hasta que alguien lo reactive a propósito.
     *
     * No se responde nada automáticamente: la confirmación al cliente la
     * manda una persona, porque enviar una plantilla nueva exige que esté
     * aprobada en Meta.
     */
    private static async applyOptOutIfRequested(params: {
        workspaceId: string;
        contactId: string;
        alreadyOptedOutAt: Date | null;
        body?: string | null;
    }): Promise<boolean> {
        if (params.alreadyOptedOutAt) {
            return false;
        }

        if (
            !matchesOptOutKeyword(params.body, appConfig.optOutKeywords)
        ) {
            return false;
        }

        const optOutAt = new Date();

        await prisma.contact.update({
            where: {
                id: params.contactId
            },
            data: {
                optOutAt,
                optOutSource: "keyword"
            }
        });

        await LogService.create({
            workspaceId: params.workspaceId,
            level: LogLevel.WARN,
            module: LogModule.CONTACT,
            action: "CONTACT_OPT_OUT_KEYWORD",
            message:
                "El contacto pidió la baja desde WhatsApp: ya no se le enviarán mensajes.",
            payload: {
                contactId: params.contactId,
                source: "keyword"
            }
        });

        return true;
    }

    private static async getOrCreateConversationForIncomingMessage(params: {
        workspaceId: string;
        whatsappNumberId: string;
        contactId: string;
    }) {
        const existingConversation = await prisma.conversation.findUnique({
            where: {
                whatsappNumberId_contactId: {
                    whatsappNumberId: params.whatsappNumberId,
                    contactId: params.contactId
                }
            }
        });

        if (existingConversation) {
            return prisma.conversation.update({
                where: {
                    id: existingConversation.id
                },
                data: {
                    status: ConversationStatus.OPEN,
                    closedAt: null,
                    operationalStatus: existingConversation.assignedUserId
                        ? ConversationOperationalStatus.IN_PROGRESS
                        : ConversationOperationalStatus.UNASSIGNED
                }
            });
        }

        return prisma.conversation.create({
            data: {
                workspaceId: params.workspaceId,
                contactId: params.contactId,
                whatsappNumberId: params.whatsappNumberId,
                status: ConversationStatus.OPEN,
                operationalStatus: ConversationOperationalStatus.UNASSIGNED,
                source: ConversationSource.INBOUND,
                lastMessageAt: new Date()
            }
        });
    }

    /**
     * Traduce el mensaje de Meta a lo que se guarda. Para las respuestas de
     * botón o de lista se guarda además **qué opción eligió** la persona: sin
     * eso, un toque quedaba como `[Mensaje interactivo]` y el dato se perdía.
     */
    private static parseIncomingMessage(
        message: MetaWebhookMessage
    ): ParsedIncomingMessage {
        if (message.type === "text") {
            return {
                type: MessageType.TEXT,
                body: message.text?.body || "",
                mediaId: null,
                mimeType: null
            };
        }

        if (message.type === "image") {
            return {
                type: MessageType.IMAGE,
                body: message.image?.caption || "[Imagen]",
                mediaId: message.image?.id || null,
                mimeType: message.image?.mime_type || null
            };
        }

        if (message.type === "video") {
            return {
                type: MessageType.VIDEO,
                body: message.video?.caption || "[Video]",
                mediaId: message.video?.id || null,
                mimeType: message.video?.mime_type || null
            };
        }

        if (message.type === "audio") {
            return {
                type: MessageType.AUDIO,
                body: "[Audio]",
                mediaId: message.audio?.id || null,
                mimeType: message.audio?.mime_type || null
            };
        }

        if (message.type === "document") {
            return {
                type: MessageType.DOCUMENT,
                body:
                    message.document?.caption ||
                    message.document?.filename ||
                    "[Documento]",
                mediaId: message.document?.id || null,
                mimeType: message.document?.mime_type || null
            };
        }

        if (message.type === "interactive") {
            const button = message.interactive?.button_reply;
            const list = message.interactive?.list_reply;
            const reply = button || list;

            return {
                type: MessageType.INTERACTIVE,
                body: reply?.title || "[Mensaje interactivo]",
                mediaId: null,
                mimeType: null,
                interactiveType: button
                    ? "button_reply"
                    : list
                      ? "list_reply"
                      : null,
                replyId: reply?.id || null,
                replyTitle: reply?.title || null
            };
        }

        return {
            type: MessageType.UNKNOWN,
            body: `[${message.type || "unknown"}]`,
            mediaId: null,
            mimeType: null
        };
    }

    private static async handleStatusUpdate(params: {
        workspaceId: string;
        status: MetaWebhookStatus;
    }) {
        const { workspaceId, status } = params;

        if (!status.id || !status.status) {
            return;
        }

        const messageStatus = this.mapMetaStatus(status.status);

        if (!messageStatus) {
            return;
        }

        const existingMessage = await prisma.message.findUnique({
            where: {
                wamid: status.id
            }
        });

        if (!existingMessage) {
            await LogService.create({
                workspaceId,
                level: LogLevel.WARN,
                module: LogModule.WEBHOOK,
                action: "WEBHOOK_STATUS_MESSAGE_NOT_FOUND",
                message: "Meta envió un status para un mensaje no encontrado.",
                payload: status
            });

            return;
        }

        const updatedMessage = await prisma.message.update({
            where: {
                id: existingMessage.id
            },
            data: {
                status: messageStatus,
                metaResponse: toPrismaJson({
                    previousMetaResponse: existingMessage.metaResponse,
                    latestStatusWebhook: status
                })
            }
        });

        emitToWorkspace(workspaceId, "message:status", {
            conversationId: updatedMessage.conversationId,
            messageId: updatedMessage.id,
            wamid: updatedMessage.wamid,
            status: updatedMessage.status
        });

        const campaignRecipientStatus =
            this.mapMetaStatusToCampaignRecipientStatus(status.status);

        if (campaignRecipientStatus) {
            await prisma.campaignRecipient.updateMany({
                where: {
                    messageId: existingMessage.id
                },
                data: {
                    status: campaignRecipientStatus,
                    ...(campaignRecipientStatus === CampaignRecipientStatus.FAILED
                        ? {
                            errorCode:
                                Array.isArray(status.errors) &&
                                status.errors[0] &&
                                typeof status.errors[0] === "object" &&
                                "code" in status.errors[0]
                                    ? String(status.errors[0].code)
                                    : null,
                            errorMessage:
                                Array.isArray(status.errors) &&
                                status.errors[0] &&
                                typeof status.errors[0] === "object" &&
                                "message" in status.errors[0]
                                    ? String(status.errors[0].message)
                                    : "Meta reportó fallo en el mensaje."
                        }
                        : {
                            errorCode: null,
                            errorMessage: null
                        })
                }
            });
        }

        await LogService.create({
            workspaceId,
            level: LogLevel.INFO,
            module: LogModule.WEBHOOK,
            action: "WEBHOOK_STATUS_UPDATED",
            message: "Estado de mensaje actualizado desde webhook.",
            payload: {
                wamid: status.id,
                status: status.status,
                messageId: existingMessage.id,
                campaignRecipientStatus
            }
        });

        /**
         * Cuando Meta reporta un fallo, se registra además en el módulo
         * MESSAGE para que el operador encuentre el motivo donde lo
         * busca, ya traducido.
         */
        if (status.status === "failed") {
            const failureDetail = describeMetaError({
                errors: status.errors
            });

            await LogService.create({
                workspaceId,
                level: LogLevel.ERROR,
                module: LogModule.MESSAGE,
                action: "MESSAGE_FAILED",
                message:
                    failureDetail ||
                    "Meta reportó que el mensaje no se pudo entregar.",
                payload: {
                    messageId: existingMessage.id,
                    wamid: status.id,
                    status: status.status,
                    error: failureDetail,
                    rawErrors: status.errors || null
                }
            });
        }
    }

    private static mapMetaStatus(status: string): MessageStatus | null {
        if (status === "sent") {
            return MessageStatus.SENT;
        }

        if (status === "delivered") {
            return MessageStatus.DELIVERED;
        }

        if (status === "read") {
            return MessageStatus.READ;
        }

        if (status === "failed") {
            return MessageStatus.FAILED;
        }

        return null;
    }


    private static mapMetaStatusToCampaignRecipientStatus(
        status: string
    ): CampaignRecipientStatus | null {
        if (status === "sent") {
            return CampaignRecipientStatus.SENT;
        }

        if (status === "delivered") {
            return CampaignRecipientStatus.DELIVERED;
        }

        if (status === "read") {
            return CampaignRecipientStatus.READ;
        }

        if (status === "failed") {
            return CampaignRecipientStatus.FAILED;
        }

        return null;
    }







}

