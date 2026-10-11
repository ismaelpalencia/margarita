import axios from "axios";
import {
    CampaignRecipientStatus,
    CampaignStatus,
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
import { decryptSecret } from "../utils/crypto";
import { describeMetaError } from "../utils/meta-error";
import {
    resolveVariableSpecs
} from "../utils/campaign-variables";
import { emitToWorkspace } from "../sockets";
import { CreateCampaignInput } from "../validations/campaign.validation";
import { renderTemplatePreview, countTemplateVariables } from "../utils/template";
import { buildTemplateMessagePayload } from "../utils/template";
import { LogService } from "./log.service";
import { WhatsAppNumberService } from "./whatsapp-number.service";

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class CampaignService {
    static async listCampaigns(workspaceId: string, whatsappNumberId?: string) {
        return prisma.campaign.findMany({
            where: {
                workspaceId,
                ...(whatsappNumberId ? { whatsappNumberId } : {})
            },
            include: {
                template: true,
                whatsappNumber: {
                    select: {
                        displayName: true,
                        phoneNumber: true
                    }
                },
                _count: {
                    select: {
                        recipients: true
                    }
                }
            },
            orderBy: {
                createdAt: "desc"
            }
        });
    }

    static async getCreateData(workspaceId: string) {
        const [templates, contacts] = await Promise.all([
            prisma.template.findMany({
                where: {
                    workspaceId,
                    status: "APPROVED"
                },
                orderBy: {
                    name: "asc"
                }
            }),

            prisma.contact.findMany({
                where: {
                    workspaceId,
                    isActive: true
                },
                orderBy: [
                    {
                        customName: "asc"
                    },
                    {
                        profileName: "asc"
                    },
                    {
                        phone: "asc"
                    }
                ],
                take: 500
            })
        ]);

        return {
            /**
             * Se envía el número de variables de cada plantilla para que
             * el formulario pueda mostrar los campos necesarios.
             */
            templates: templates.map((template) => ({
                ...template,
                variableCount: countTemplateVariables(template.components)
            })),
            contacts
        };
    }

    /**
     * Toma las variables escritas por el usuario (hasta tres) y devuelve
     * solo las que la plantilla necesita.
     */
    private static resolveSpecs(
        input: { variable1?: string; variable2?: string; variable3?: string },
        requiredVariables: number
    ): string[] {
        return [input.variable1 || "", input.variable2 || "", input.variable3 || ""].slice(
            0,
            requiredVariables
        );
    }

    static async createCampaign(
        workspaceId: string,
        createdById: string,
        input: CreateCampaignInput,
        whatsappNumberId: string
    ) {
        if (input.contactIds.length === 0) {
            throw new Error("Selecciona al menos un contacto.");
        }

        const template = await prisma.template.findFirst({
            where: {
                id: input.templateId,
                workspaceId,
                status: "APPROVED"
            }
        });

        if (!template) {
            throw new Error("Plantilla no encontrada o no aprobada.");
        }

        const contacts = await prisma.contact.findMany({
            where: {
                workspaceId,
                id: {
                    in: input.contactIds
                },
                isActive: true
            },
            select: {
                id: true,
                phone: true,
                customName: true,
                profileName: true
            }
        });

        if (contacts.length === 0) {
            throw new Error("No hay contactos válidos para la campaña.");
        }

        const requiredVariables = countTemplateVariables(template.components);
        const specs = this.resolveSpecs(input, requiredVariables);

        if (
            requiredVariables > 0 &&
            specs.some((spec) => spec.trim() === "")
        ) {
            throw new Error(
                `Esta plantilla necesita ${requiredVariables} variable(s). Complétalas para continuar.`
            );
        }

        /**
         * Los valores se resuelven una sola vez, al crear la campaña, y se
         * guardan por destinatario: así queda registro exacto de lo que se
         * envió y el envío no depende de que el contacto cambie después.
         */
        const recipients = contacts.map((contact) => {
            const resolved = resolveVariableSpecs(
                requiredVariables > 0 ? specs : [],
                {
                    name: contact.customName || contact.profileName,
                    phone: contact.phone,
                    columns: {}
                }
            );

            return {
                contactId: contact.id,
                phone: contact.phone,
                status: CampaignRecipientStatus.PENDING,
                variables:
                    requiredVariables > 0
                        ? (resolved.values as Prisma.InputJsonValue)
                        : undefined,
                resolvedValues: resolved.values
            };
        });

        const emptyValues = recipients.filter(
            (recipient) =>
                requiredVariables > 0 &&
                recipient.resolvedValues.some((value) => value === "")
        );

        if (emptyValues.length > 0) {
            throw new Error(
                `${emptyValues.length} contacto(s) quedaron sin el dato que pide una variable. ` +
                    "Si usaste {nombre}, esos contactos no tienen nombre registrado: usa un valor fijo."
            );
        }

        const campaign = await prisma.campaign.create({
            data: {
                workspaceId,
                templateId: template.id,
                whatsappNumberId,
                createdById,
                name: input.name,
                status: CampaignStatus.DRAFT,
                totalRecipients: contacts.length,
                validRecipients: contacts.length,
                invalidRecipients: 0,
                duplicateRecipients: 0,
                recipients: {
                    create: recipients.map((recipient) => ({
                        contactId: recipient.contactId,
                        phone: recipient.phone,
                        status: recipient.status,
                        variables: recipient.variables
                    }))
                }
            },
            include: {
                recipients: true
            }
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.INFO,
            module: LogModule.CAMPAIGN,
            action: "CAMPAIGN_CREATED",
            message: "Campaña creada correctamente.",
            payload: {
                campaignId: campaign.id,
                name: campaign.name,
                recipients: campaign.recipients.length,
                templateId: template.id
            }
        });

        return campaign;
    }

    static async getCampaign(workspaceId: string, campaignId: string) {
        return prisma.campaign.findFirst({
            where: {
                id: campaignId,
                workspaceId
            },
            include: {
                template: true,
                createdBy: true,
                recipients: {
                    include: {
                        contact: true,
                        message: true
                    },
                    orderBy: {
                        createdAt: "desc"
                    }
                }
            }
        });
    }

    static async sendCampaign(workspaceId: string, campaignId: string) {
        const campaign = await prisma.campaign.findFirst({
            where: {
                id: campaignId,
                workspaceId
            },
            include: {
                template: true,
                recipients: {
                    where: {
                        status: CampaignRecipientStatus.PENDING
                    },
                    include: {
                        contact: true
                    },
                    orderBy: {
                        createdAt: "asc"
                    }
                }
            }
        });

        if (!campaign) {
            throw new Error("Campaña no encontrada.");
        }

        if (
            campaign.status !== CampaignStatus.DRAFT &&
            campaign.status !== CampaignStatus.READY &&
            campaign.status !== CampaignStatus.FAILED
        ) {
            throw new Error("La campaña no se puede enviar en su estado actual.");
        }

        if (campaign.template.status !== "APPROVED") {
            throw new Error("La plantilla de la campaña no está aprobada.");
        }

        const requiredVariables = countTemplateVariables(campaign.template.components);

        if (requiredVariables > 0) {
            /**
             * Una campaña creada antes de soportar variables podría no
             * tenerlas. Es mejor fallar aquí, con un mensaje claro, que
             * dejar que Meta rechace cada envío con un error técnico.
             */
            const withoutVariables = campaign.recipients.filter(
                (recipient) => {
                    const stored = Array.isArray(recipient.variables)
                        ? recipient.variables
                        : [];

                    return stored.length !== requiredVariables;
                }
            );

            if (withoutVariables.length > 0) {
                throw new Error(
                    `${withoutVariables.length} destinatario(s) no tienen los valores de las ` +
                        `${requiredVariables} variable(s) de la plantilla. Crea la campaña de nuevo con esos datos.`
                );
            }
        }

        if (campaign.recipients.length === 0) {
            throw new Error("No hay destinatarios pendientes.");
        }

        /**
         * La campaña se envía desde el número con el que se creó: el token
         * viene de la WABA y el `phone_number_id` de ese número.
         */
        const campaignNumber = await WhatsAppNumberService.getById(
            workspaceId,
            campaign.whatsappNumberId
        );

        if (!campaignNumber) {
            throw new Error(
                "El número de esta campaña ya no está disponible en la cuenta."
            );
        }

        if (!campaignNumber.isActive) {
            throw new Error(
                "El número de esta campaña está desactivado. Actívalo para poder enviarla."
            );
        }

        const credentials = WhatsAppNumberService.credentialsFor(campaignNumber);

        await prisma.campaign.update({
            where: {
                id: campaign.id
            },
            data: {
                status: CampaignStatus.RUNNING,
                startedAt: campaign.startedAt || new Date()
            }
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.INFO,
            module: LogModule.CAMPAIGN,
            action: "CAMPAIGN_SEND_STARTED",
            message: "Inicio de envío de campaña.",
            payload: {
                campaignId: campaign.id,
                recipients: campaign.recipients.length
            }
        });

        let sentCount = 0;
        let failedCount = 0;

        for (const recipient of campaign.recipients) {
            try {
                await prisma.campaignRecipient.update({
                    where: {
                        id: recipient.id
                    },
                    data: {
                        status: CampaignRecipientStatus.SENDING
                    }
                });

                if (!recipient.contact) {
                    throw new Error("El destinatario no tiene contacto asociado.");
                }

                const conversation = await this.getOrCreateCampaignConversation({
                    workspaceId,
                    whatsappNumberId: campaign.whatsappNumberId,
                    contactId: recipient.contact.id
                });

                const previewBody = renderTemplatePreview(
                    campaign.template.components,
                    Array.isArray(recipient.variables)
                        ? recipient.variables.map(String)
                        : []
                );

                const recipientVariables = Array.isArray(recipient.variables)
                    ? recipient.variables.map(String)
                    : [];

                const localMessage = await prisma.message.create({
                    data: {
                        workspaceId,
                        conversationId: conversation.id,
                        campaignId: campaign.id,
                        direction: MessageDirection.OUT,
                        type: MessageType.TEMPLATE,
                        status: MessageStatus.SENDING,
                        source: MessageSource.CAMPAIGN,
                        body: previewBody,
                        metaPayload: toPrismaJson({
                            campaignId: campaign.id,
                            campaignRecipientId: recipient.id,
                            templateId: campaign.template.id,
                            templateName: campaign.template.name,
                            language: campaign.template.language,
                            phone: recipient.phone
                        })
                    }
                });

                const payload = buildTemplateMessagePayload({
                    to: recipient.phone,
                    name: campaign.template.name,
                    language: campaign.template.language,
                    variables: recipientVariables
                });

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
                        metaResponse: toPrismaJson(response.data)
                    }
                });

                await prisma.campaignRecipient.update({
                    where: {
                        id: recipient.id
                    },
                    data: {
                        status: CampaignRecipientStatus.SENT,
                        messageId: updatedMessage.id,
                        errorCode: null,
                        errorMessage: null
                    }
                });

                await prisma.conversation.update({
                    where: {
                        id: conversation.id
                    },
                    data: {
                        lastMessageAt: updatedMessage.createdAt,
                        status: ConversationStatus.OPEN,
                        operationalStatus: conversation.assignedUserId
                            ? ConversationOperationalStatus.IN_PROGRESS
                            : ConversationOperationalStatus.UNASSIGNED,
                        closedAt: null
                    }
                });

                sentCount++;

                if ((sentCount + failedCount) % 25 === 0) {
                    emitToWorkspace(workspaceId, "campaign:progress", {
                        campaignId: campaign.id,
                        sentCount,
                        failedCount,
                        total: campaign.totalRecipients,
                        status: CampaignStatus.RUNNING
                    });
                }
            } catch (error) {
                failedCount++;

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

                await prisma.campaignRecipient.update({
                    where: {
                        id: recipient.id
                    },
                    data: {
                        status: CampaignRecipientStatus.FAILED,
                        errorCode: axios.isAxiosError(error)
                            ? String(error.response?.data?.error?.code || "")
                            : null,
                        errorMessage: axios.isAxiosError(error)
                            ? String(
                                  error.response?.data?.error?.message ||
                                      error.message
                              )
                            : error instanceof Error
                              ? error.message
                              : "Error desconocido"
                    }
                });

                await LogService.create({
                    workspaceId,
                    level: LogLevel.ERROR,
                    module: LogModule.CAMPAIGN,
                    action: "CAMPAIGN_RECIPIENT_FAILED",
                    message:
                        describeMetaError(errorPayload) ||
                        "No se pudo enviar la campaña a un destinatario.",
                    payload: {
                        campaignId: campaign.id,
                        recipientId: recipient.id,
                        phone: recipient.phone,
                        reason: describeMetaError(errorPayload),
                        error: errorPayload
                    }
                });
            }
        }

        const finalStatus =
            failedCount > 0 && sentCount === 0
                ? CampaignStatus.FAILED
                : CampaignStatus.FINISHED;

        await prisma.campaign.update({
            where: {
                id: campaign.id
            },
            data: {
                status: finalStatus,
                finishedAt: new Date()
            }
        });

        await LogService.create({
            workspaceId,
            level: failedCount > 0 ? LogLevel.WARN : LogLevel.INFO,
            module: LogModule.CAMPAIGN,
            action: "CAMPAIGN_SEND_FINISHED",
            message: "Envío de campaña finalizado.",
            payload: {
                campaignId: campaign.id,
                sentCount,
                failedCount,
                finalStatus
            }
        });

        emitToWorkspace(workspaceId, "campaign:progress", {
            campaignId: campaign.id,
            sentCount,
            failedCount,
            total: campaign.totalRecipients,
            status: finalStatus
        });

        return {
            sentCount,
            failedCount,
            finalStatus
        };
    }

    static async retryFailedRecipients(workspaceId: string, campaignId: string) {
        const campaign = await prisma.campaign.findFirst({
            where: {
                id: campaignId,
                workspaceId
            },
            include: {
                recipients: {
                    where: {
                        status: CampaignRecipientStatus.FAILED
                    }
                }
            }
        });

        if (!campaign) {
            throw new Error("Campaña no encontrada.");
        }

        if (campaign.recipients.length === 0) {
            throw new Error("No hay destinatarios fallidos para reintentar.");
        }

        await prisma.campaignRecipient.updateMany({
            where: {
                campaignId: campaign.id,
                status: CampaignRecipientStatus.FAILED
            },
            data: {
                status: CampaignRecipientStatus.PENDING,
                errorCode: null,
                errorMessage: null
            }
        });

        await prisma.campaign.update({
            where: {
                id: campaign.id
            },
            data: {
                status: CampaignStatus.READY,
                finishedAt: null
            }
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.INFO,
            module: LogModule.CAMPAIGN,
            action: "CAMPAIGN_FAILED_RECIPIENTS_RETRY_PREPARED",
            message: "Destinatarios fallidos preparados para reintento.",
            payload: {
                campaignId: campaign.id,
                failedRecipients: campaign.recipients.length
            }
        });

        return this.sendCampaign(workspaceId, campaign.id);
    }


    private static async getOrCreateCampaignConversation(params: {
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
                    closedAt: null
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
                source: ConversationSource.CAMPAIGN,
                lastMessageAt: new Date()
            }
        });
    }
}
