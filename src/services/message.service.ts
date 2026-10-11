import axios from "axios";
import {
    ConversationOperationalStatus,
    ConversationStatus,
    LogLevel,
    LogModule,
    MessageDirection,
    MessageSource,
    MessageStatus,
    MessageType,
    UserRole
} from "@prisma/client";

import { prisma } from "../config/prisma";
import { SendLocalMessageInput } from "../validations/message.validation";
import { SendTemplateMessageInput } from "../validations/template-message.validation";
import { SendFreeTextMessageInput } from "../validations/free-text-message.validation";
import {
    buildTemplateMessagePayload,
    countTemplateVariables,
    renderTemplatePreview
} from "../utils/template";
import { isConversationWindowOpen } from "../utils/conversation-window";
import { decryptSecret } from "../utils/crypto";
import { describeMetaError } from "../utils/meta-error";
import { emitToWorkspace } from "../sockets";
import { LogService } from "./log.service";

type SendLocalMessageParams = {
    workspaceId: string;
    conversationId: string;
    userId: string;
    role: UserRole;
    input: SendLocalMessageInput;
};

type SendTemplateMessageParams = {
    workspaceId: string;
    conversationId: string;
    userId: string;
    role: UserRole;
    input: SendTemplateMessageInput;
};

type SendFreeTextMessageParams = {
    workspaceId: string;
    conversationId: string;
    userId: string;
    role: UserRole;
    input: SendFreeTextMessageInput;
};

export class MessageService {
    static async sendLocalMessage(params: SendLocalMessageParams) {
        const conversation = await this.getConversationForSending(
            params.workspaceId,
            params.conversationId,
            params.userId,
            params.role
        );

        const message = await prisma.message.create({
            data: {
                workspaceId: params.workspaceId,
                conversationId: conversation.id,
                sentByUserId: params.userId,
                direction: MessageDirection.OUT,
                type: MessageType.TEXT,
                status: MessageStatus.CREATED,
                source: MessageSource.MANUAL,
                body: params.input.body
            }
        });

        await this.touchConversationAfterOutgoingMessage(
            conversation.id,
            message.createdAt,
            conversation.assignedUserId
        );

        this.emitOutgoingMessage(params.workspaceId, conversation, message);

        return message;
    }

    static async sendTemplateMessage(params: SendTemplateMessageParams) {
        const conversation = await this.getConversationForSending(
            params.workspaceId,
            params.conversationId,
            params.userId,
            params.role
        );

        const [account, template] = await Promise.all([
            prisma.whatsAppAccount.findUnique({
                where: {
                    workspaceId: params.workspaceId
                }
            }),
            prisma.template.findFirst({
                where: {
                    id: params.input.templateId,
                    workspaceId: params.workspaceId
                }
            })
        ]);

        if (!account) {
            throw new Error("No hay cuenta de WhatsApp configurada.");
        }

        if (!template) {
            throw new Error("Plantilla no encontrada.");
        }

        if (template.status !== "APPROVED") {
            throw new Error("Solo se pueden enviar plantillas aprobadas.");
        }

        const variables = [
            params.input.variable1,
            params.input.variable2,
            params.input.variable3
        ];

        const requiredVariables = countTemplateVariables(template.components);

        const usedVariables = variables.slice(0, requiredVariables);

        if (usedVariables.some((value) => value.trim() === "")) {
            throw new Error("Faltan variables para la plantilla.");
        }

        const previewBody = renderTemplatePreview(
            template.components,
            usedVariables
        );

        const localMessage = await prisma.message.create({
            data: {
                workspaceId: params.workspaceId,
                conversationId: conversation.id,
                sentByUserId: params.userId,
                direction: MessageDirection.OUT,
                type: MessageType.TEMPLATE,
                status: MessageStatus.SENDING,
                source: MessageSource.MANUAL,
                body: previewBody,
                metaPayload: {
                    templateId: template.id,
                    templateName: template.name,
                    language: template.language,
                    variables: usedVariables
                }
            }
        });

        const payload = buildTemplateMessagePayload({
            to: conversation.contact.phone,
            name: template.name,
            language: template.language,
            variables: usedVariables
        });

        try {
            const response = await axios.post(
                `https://graph.facebook.com/${account.apiVersion}/${account.phoneNumberId}/messages`,
                payload,
                {
                    params: {
                        access_token: decryptSecret(account.accessToken)
                    },
                    timeout: 15000
                }
            );

            const wamid =
                Array.isArray(response.data?.messages) &&
                response.data.messages[0]?.id
                    ? String(response.data.messages[0].id)
                    : null;

            const updatedMessage = await prisma.message.update({
                where: {
                    id: localMessage.id
                },
                data: {
                    status: MessageStatus.SENT,
                    wamid,
                    metaResponse: response.data
                }
            });

            await this.touchConversationAfterOutgoingMessage(
                conversation.id,
                updatedMessage.createdAt,
                conversation.assignedUserId
            );

            this.emitOutgoingMessage(
                params.workspaceId,
                conversation,
                updatedMessage
            );

            return updatedMessage;
        } catch (error) {
            const errorPayload =
                axios.isAxiosError(error)
                    ? {
                          status: error.response?.status,
                          data: error.response?.data,
                          message: error.message
                      }
                    : {
                          message:
                              error instanceof Error
                                  ? error.message
                                  : "Error desconocido"
                      };

            const failedMessage = await prisma.message.update({
                where: {
                    id: localMessage.id
                },
                data: {
                    status: MessageStatus.FAILED,
                    metaResponse: errorPayload
                }
            });

            await this.touchConversationAfterOutgoingMessage(
                conversation.id,
                failedMessage.createdAt,
                conversation.assignedUserId
            );

            this.emitOutgoingMessage(
                params.workspaceId,
                conversation,
                failedMessage
            );

            throw new Error("No se pudo enviar la plantilla a Meta.");
        }
    }

    static async sendFreeTextMessage(params: SendFreeTextMessageParams) {
        const conversation = await this.getConversationForSending(
            params.workspaceId,
            params.conversationId,
            params.userId,
            params.role
        );

        if (!isConversationWindowOpen(conversation.lastIncomingMessageAt)) {
            throw new Error(
                "La ventana de 24 horas está cerrada. Usa una plantilla aprobada."
            );
        }

        const account = await prisma.whatsAppAccount.findUnique({
            where: {
                workspaceId: params.workspaceId
            }
        });

        if (!account) {
            throw new Error("No hay cuenta de WhatsApp configurada.");
        }

        const localMessage = await prisma.message.create({
            data: {
                workspaceId: params.workspaceId,
                conversationId: conversation.id,
                sentByUserId: params.userId,
                direction: MessageDirection.OUT,
                type: MessageType.TEXT,
                status: MessageStatus.SENDING,
                source: MessageSource.MANUAL,
                body: params.input.body,
                metaPayload: {
                    type: "text",
                    body: params.input.body
                }
            }
        });

        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: conversation.contact.phone,
            type: "text",
            text: {
                preview_url: false,
                body: params.input.body
            }
        };

        try {
            const response = await axios.post(
                `https://graph.facebook.com/${account.apiVersion}/${account.phoneNumberId}/messages`,
                payload,
                {
                    params: {
                        access_token: decryptSecret(account.accessToken)
                    },
                    timeout: 15000
                }
            );

            const wamid =
                Array.isArray(response.data?.messages) &&
                response.data.messages[0]?.id
                    ? String(response.data.messages[0].id)
                    : null;

            const updatedMessage = await prisma.message.update({
                where: {
                    id: localMessage.id
                },
                data: {
                    status: MessageStatus.SENT,
                    wamid,
                    metaResponse: response.data
                }
            });

            await this.touchConversationAfterOutgoingMessage(
                conversation.id,
                updatedMessage.createdAt,
                conversation.assignedUserId
            );

            this.emitOutgoingMessage(
                params.workspaceId,
                conversation,
                updatedMessage
            );

            return updatedMessage;
        } catch (error) {
            const errorPayload =
                axios.isAxiosError(error)
                    ? {
                          status: error.response?.status,
                          data: error.response?.data,
                          message: error.message
                      }
                    : {
                          message:
                              error instanceof Error
                                  ? error.message
                                  : "Error desconocido"
                      };

            const failedMessage = await prisma.message.update({
                where: {
                    id: localMessage.id
                },
                data: {
                    status: MessageStatus.FAILED,
                    metaResponse: errorPayload
                }
            });

            await this.touchConversationAfterOutgoingMessage(
                conversation.id,
                failedMessage.createdAt,
                conversation.assignedUserId
            );

            this.emitOutgoingMessage(
                params.workspaceId,
                conversation,
                failedMessage
            );

            throw new Error("No se pudo enviar el mensaje de texto a Meta.");
        }
    }

    private static emitOutgoingMessage(
        workspaceId: string,
        conversation: {
            id: string;
            assignedUserId: string | null;
            contact: {
                id: string;
                customName: string | null;
                profileName: string | null;
                phone: string;
            };
        },
        message: {
            id: string;
            wamid: string | null;
            direction: MessageDirection;
            type: MessageType;
            status: MessageStatus;
            source: MessageSource;
            body: string | null;
            metaResponse: unknown;
            createdAt: Date;
        }
    ) {
        /**
         * La nota local nunca se envía a Meta: se avisa a los navegadores
         * pero no tiene sentido auditarla como envío.
         */
        if (message.status !== MessageStatus.CREATED) {
            const failed = message.status === MessageStatus.FAILED;
            const detail = describeMetaError(message.metaResponse);

            /**
             * Antes, un mensaje que fallaba solo cambiaba de estado en la
             * conversación y el motivo quedaba guardado en metaResponse,
             * invisible para el operador. Aquí queda en la bitácora.
             */
            void LogService.create({
                workspaceId,
                level: failed ? LogLevel.ERROR : LogLevel.INFO,
                module: LogModule.MESSAGE,
                action: failed ? "MESSAGE_FAILED" : "MESSAGE_SENT",
                message: failed
                    ? detail || "No se pudo enviar el mensaje a Meta."
                    : `Mensaje enviado a ${conversation.contact.phone}.`,
                payload: {
                    messageId: message.id,
                    type: message.type,
                    to: conversation.contact.phone,
                    wamid: message.wamid,
                    status: message.status,
                    error: detail
                }
            }).catch((error) => {
                console.error("No se pudo registrar el envío en la bitácora:", error);
            });
        }

        emitToWorkspace(workspaceId, "conversation:message", {
            conversationId: conversation.id,
            assignedUserId: conversation.assignedUserId,
            contact: {
                id: conversation.contact.id,
                name:
                    conversation.contact.customName ||
                    conversation.contact.profileName ||
                    conversation.contact.phone,
                phone: conversation.contact.phone
            },
            message: {
                id: message.id,
                wamid: message.wamid,
                direction: message.direction,
                type: message.type,
                status: message.status,
                source: message.source,
                body: message.body,
                createdAt: message.createdAt.toISOString()
            }
        });
    }
    private static async getConversationForSending(
        workspaceId: string,
        conversationId: string,
        userId: string,
        role: UserRole
    ) {
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                workspaceId,
                ...(role === UserRole.AGENT
                    ? {
                          assignedUserId: userId
                      }
                    : {})
            },
            include: {
                contact: true
            }
        });

        if (!conversation) {
            throw new Error("Conversación no encontrada.");
        }

        if (conversation.status !== ConversationStatus.OPEN) {
            throw new Error("No puedes enviar mensajes en una conversación cerrada.");
        }

        return conversation;
    }

    private static async touchConversationAfterOutgoingMessage(
        conversationId: string,
        lastMessageAt: Date,
        assignedUserId: string | null
    ) {
        await prisma.conversation.update({
            where: {
                id: conversationId
            },
            data: {
                lastMessageAt,
                operationalStatus: assignedUserId
                    ? ConversationOperationalStatus.IN_PROGRESS
                    : ConversationOperationalStatus.UNASSIGNED
            }
        });
    }
}
