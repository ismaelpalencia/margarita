import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
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
import { appConfig } from "../config/app.config";
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
import {
    buildMediaMessagePayload,
    classifyUpload
} from "../utils/media-message";
import { emitToWorkspace } from "../sockets";
import { LogService } from "./log.service";
import { uploadMediaToMeta } from "./media.service";
import {
    NumberCredentials,
    WhatsAppNumberService
} from "./whatsapp-number.service";
import {
    buildMediaRelativePath,
    extensionFromMime,
    sanitizeFilename,
    writeMediaFile
} from "./media-storage.service";

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

type SendMediaMessageParams = {
    workspaceId: string;
    conversationId: string;
    userId: string;
    role: UserRole;
    file: {
        path: string;
        originalname: string;
        mimetype: string;
        size: number;
    };
    caption?: string | null;
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

        const [credentials, template] = await Promise.all([
            this.getSendingCredentials(conversation),
            prisma.template.findFirst({
                where: {
                    id: params.input.templateId,
                    workspaceId: params.workspaceId
                }
            })
        ]);

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
                `${appConfig.graphBaseUrl}/${credentials.apiVersion}/${credentials.phoneNumberId}/messages`,
                payload,
                {
                    params: {
                        access_token: credentials.accessToken
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

        const credentials = await this.getSendingCredentials(conversation);

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
                `${appConfig.graphBaseUrl}/${credentials.apiVersion}/${credentials.phoneNumberId}/messages`,
                payload,
                {
                    params: {
                        access_token: credentials.accessToken
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
    /**
     * Autoriza una acción sobre el hilo: el admin puede con cualquier
     * conversación de su workspace y el agente solo con las asignadas a él.
     */
    private static async getConversationForModeration(
        workspaceId: string,
        conversationId: string,
        actor: { id: string; role: UserRole }
    ) {
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                workspaceId
            }
        });

        if (!conversation) {
            throw new Error("Conversación no encontrada.");
        }

        if (
            actor.role === UserRole.AGENT &&
            conversation.assignedUserId !== actor.id
        ) {
            throw new Error("No puedes modificar esta conversación.");
        }

        return conversation;
    }

    /**
     * Oculta un mensaje del hilo. No se borra de la base: el admin puede
     * verlo y restaurarlo.
     */
    static async deleteMessage(params: {
        workspaceId: string;
        conversationId: string;
        messageId: string;
        actor: { id: string; role: UserRole };
    }) {
        await this.getConversationForModeration(
            params.workspaceId,
            params.conversationId,
            params.actor
        );

        const message = await prisma.message.findFirst({
            where: {
                id: params.messageId,
                conversationId: params.conversationId,
                workspaceId: params.workspaceId
            }
        });

        if (!message) {
            throw new Error("Mensaje no encontrado.");
        }

        await prisma.message.update({
            where: {
                id: message.id
            },
            data: {
                deletedAt: new Date()
            }
        });

        await LogService.create({
            workspaceId: params.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.MESSAGE,
            action: "MESSAGE_DELETED",
            message: "Mensaje oculto del chat (se puede restaurar).",
            payload: {
                messageId: message.id,
                conversationId: params.conversationId,
                actorId: params.actor.id,
                role: params.actor.role
            }
        });
    }

    static async restoreMessage(params: {
        workspaceId: string;
        conversationId: string;
        messageId: string;
        actor: { id: string; role: UserRole };
    }) {
        await this.getConversationForModeration(
            params.workspaceId,
            params.conversationId,
            params.actor
        );

        const message = await prisma.message.findFirst({
            where: {
                id: params.messageId,
                conversationId: params.conversationId,
                workspaceId: params.workspaceId
            }
        });

        if (!message) {
            throw new Error("Mensaje no encontrado.");
        }

        await prisma.message.update({
            where: {
                id: message.id
            },
            data: {
                deletedAt: null
            }
        });

        await LogService.create({
            workspaceId: params.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.MESSAGE,
            action: "MESSAGE_RESTORED",
            message: "Mensaje restaurado en el chat.",
            payload: {
                messageId: message.id,
                conversationId: params.conversationId,
                actorId: params.actor.id
            }
        });
    }

    /**
     * Envía una imagen, video, audio o documento dentro de la ventana de
     * 24 horas.
     *
     * El archivo se guarda primero en el almacenamiento local para que
     * aparezca en el hilo aunque Meta falle, y después se sube a Meta para
     * obtener el `media id` con el que se envía.
     */
    static async sendMediaMessage(params: SendMediaMessageParams) {
        try {
            return await this.dispatchMediaMessage(params);
        } finally {
            /**
             * El temporal de multer se borra siempre, incluso cuando el
             * envío se rechaza antes de subir (ventana cerrada, formato
             * no permitido, archivo demasiado grande).
             */
            fs.promises.unlink(params.file.path).catch(() => undefined);
        }
    }

    private static async dispatchMediaMessage(params: SendMediaMessageParams) {
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

        const classified = classifyUpload({
            mimeType: params.file.mimetype,
            filename: sanitizeFilename(params.file.originalname, "archivo")
        });

        if (!classified.ok) {
            throw new Error(classified.reason);
        }

        const upload = classified.value;
        const buffer = fs.readFileSync(params.file.path);

        if (buffer.length > upload.maxBytes) {
            throw new Error(
                `El archivo pesa ${(buffer.length / 1024 / 1024).toFixed(1)} MB y el límite para ` +
                    `${upload.type.toLowerCase()} es ${Math.round(upload.maxBytes / 1024 / 1024)} MB.`
            );
        }

        const credentials = await this.getSendingCredentials(conversation);

        const caption = params.caption?.trim() || null;

        const localMessage = await prisma.message.create({
            data: {
                workspaceId: params.workspaceId,
                conversationId: conversation.id,
                sentByUserId: params.userId,
                direction: MessageDirection.OUT,
                type: upload.type,
                status: MessageStatus.SENDING,
                source: MessageSource.MANUAL,
                body: caption || `[${upload.type}]`,
                mimeType: upload.mimeType,
                mediaFilename: upload.filename
            }
        });

        const extension =
            extensionFromMime(upload.mimeType) ||
            path.extname(upload.filename).toLowerCase();

        const relativePath = buildMediaRelativePath({
            workspaceId: params.workspaceId,
            messageId: localMessage.id,
            extension
        });

        writeMediaFile(relativePath, buffer);

        await prisma.message.update({
            where: {
                id: localMessage.id
            },
            data: {
                mediaPath: relativePath,
                mediaSize: buffer.length,
                mediaDownloadedAt: new Date()
            }
        });

        const failWith = async (error: unknown) => {
            const errorPayload = axios.isAxiosError(error)
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
                    metaResponse: toPrismaJson(errorPayload)
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

            return failedMessage;
        };

        try {
            const mediaId = await uploadMediaToMeta({
                phoneNumberId: credentials.phoneNumberId,
                apiVersion: credentials.apiVersion,
                accessToken: credentials.accessToken,
                buffer,
                mimeType: upload.mimeType,
                filename: upload.filename
            });

            const payload = buildMediaMessagePayload({
                to: conversation.contact.phone,
                type: upload.type,
                mediaId,
                caption,
                filename: upload.filename
            });

            const response = await axios.post(
                `${appConfig.graphBaseUrl}/${credentials.apiVersion}/${credentials.phoneNumberId}/messages`,
                payload,
                {
                    params: {
                        access_token: credentials.accessToken
                    },
                    timeout: 30000
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
                    metaResponse: toPrismaJson({
                        mediaId,
                        response: response.data
                    })
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
            await failWith(error);

            throw new Error(
                error instanceof Error
                    ? error.message
                    : "No se pudo enviar el archivo a Meta."
            );
        }
    }

    /**
     * Resuelve con qué número se envía en una conversación. El token sale
     * de la WABA y el `phone_number_id` del número asignado al hilo.
     */
    private static async getSendingCredentials(conversation: {
        workspaceId: string;
        whatsappNumberId: string;
    }): Promise<NumberCredentials> {
        const number = await WhatsAppNumberService.getById(
            conversation.workspaceId,
            conversation.whatsappNumberId
        );

        if (!number) {
            throw new Error(
                "El número de esta conversación ya no está disponible en la cuenta."
            );
        }

        if (!number.isActive) {
            throw new Error(
                "Este número está desactivado. Actívalo o usa otro para responder."
            );
        }

        return WhatsAppNumberService.credentialsFor(number);
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
