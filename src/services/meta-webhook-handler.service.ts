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
import {
    MetaWebhookMessage,
    MetaWebhookPayload,
    MetaWebhookStatus
} from "../types/meta-webhook";
import { normalizeMexicanPhone } from "../utils/phone";
import { emitToWorkspace } from "../sockets";
import { AssignmentService } from "./assignment.service";
import { LogService } from "./log.service";

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class MetaWebhookHandlerService {
    static async handleIncomingPayload(payload: MetaWebhookPayload) {
        const entries = payload.entry || [];

        for (const entry of entries) {
            const changes = entry.changes || [];

            for (const change of changes) {
                if (change.field !== "messages") {
                    continue;
                }

                const value = change.value;

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

                const account = await prisma.whatsAppAccount.findFirst({
                    where: {
                        phoneNumberId
                    }
                });

                if (!account) {
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
                        workspaceId: account.workspaceId,
                        message,
                        profileName: contacts.find(
                            (contact) => contact.wa_id === message.from
                        )?.profile?.name
                    });
                }

                for (const status of statuses) {
                    await this.handleStatusUpdate({
                        workspaceId: account.workspaceId,
                        status
                    });
                }
            }
        }
    }

    private static async handleIncomingMessage(params: {
        workspaceId: string;
        message: MetaWebhookMessage;
        profileName?: string;
    }) {
        const { workspaceId, message, profileName } = params;

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

        const contact = await prisma.contact.upsert({
            where: {
                workspaceId_phone: {
                    workspaceId,
                    phone: normalizedPhone
                }
            },
            update: {
                profileName: profileName || undefined,
                lastSeenAt: new Date(),
                isActive: true
            },
            create: {
                workspaceId,
                phone: normalizedPhone,
                profileName: profileName || null,
                lastSeenAt: new Date(),
                isActive: true
            }
        });

        const conversation = await this.getOrCreateConversationForIncomingMessage({
            workspaceId,
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
                metaPayload: toPrismaJson(message),
                createdAt: messageDate
            }
        });

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
                closedAt: null
            }
        });

        let finalConversation = updatedConversation;

        if (!updatedConversation.assignedUserId) {
            finalConversation = await AssignmentService.assignLeastBusyAgent({
                workspaceId,
                conversationId: updatedConversation.id
            });
        }

        emitToWorkspace(workspaceId, "conversation:message", {
            conversationId: conversation.id,
            assignedUserId: finalConversation.assignedUserId,
            contact: {
                id: contact.id,
                name:
                    contact.customName || contact.profileName || contact.phone,
                phone: contact.phone
            },
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

    private static async getOrCreateConversationForIncomingMessage(params: {
        workspaceId: string;
        contactId: string;
    }) {
        const existingConversation = await prisma.conversation.findUnique({
            where: {
                workspaceId_contactId: {
                    workspaceId: params.workspaceId,
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
                status: ConversationStatus.OPEN,
                operationalStatus: ConversationOperationalStatus.UNASSIGNED,
                source: ConversationSource.INBOUND,
                lastMessageAt: new Date()
            }
        });
    }

    private static parseIncomingMessage(message: MetaWebhookMessage) {
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
            return {
                type: MessageType.INTERACTIVE,
                body: "[Mensaje interactivo]",
                mediaId: null,
                mimeType: null
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

