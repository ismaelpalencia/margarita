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
import { decryptSecret } from "../utils/crypto";
import { emitToWorkspace } from "../sockets";
import { CreateCampaignInput } from "../validations/campaign.validation";
import { renderTemplatePreview, countTemplateVariables } from "../utils/template";
import { LogService } from "./log.service";

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class CampaignService {
    static async listCampaigns(workspaceId: string) {
        return prisma.campaign.findMany({
            where: {
                workspaceId
            },
            include: {
                template: true,
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
            templates,
            contacts
        };
    }

    static async createCampaign(
        workspaceId: string,
        createdById: string,
        input: CreateCampaignInput
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
                phone: true
            }
        });

        if (contacts.length === 0) {
            throw new Error("No hay contactos válidos para la campaña.");
        }

        const campaign = await prisma.campaign.create({
            data: {
                workspaceId,
                templateId: template.id,
                createdById,
                name: input.name,
                status: CampaignStatus.DRAFT,
                totalRecipients: contacts.length,
                validRecipients: contacts.length,
                invalidRecipients: 0,
                duplicateRecipients: 0,
                recipients: {
                    create: contacts.map((contact) => ({
                        contactId: contact.id,
                        phone: contact.phone,
                        status: CampaignRecipientStatus.PENDING
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
            throw new Error(
                "Esta versión de campañas solo soporta plantillas sin variables."
            );
        }

        if (campaign.recipients.length === 0) {
            throw new Error("No hay destinatarios pendientes.");
        }

        const account = await prisma.whatsAppAccount.findUnique({
            where: {
                workspaceId
            }
        });

        if (!account) {
            throw new Error("No hay cuenta de WhatsApp configurada.");
        }

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
                    contactId: recipient.contact.id
                });

                const previewBody = renderTemplatePreview(
                    campaign.template.components,
                    []
                );

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

                const payload = {
                    messaging_product: "whatsapp",
                    to: recipient.phone,
                    type: "template",
                    template: {
                        name: campaign.template.name,
                        language: {
                            code: campaign.template.language
                        }
                    }
                };

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
                    message: "No se pudo enviar la campaña a un destinatario.",
                    payload: {
                        campaignId: campaign.id,
                        recipientId: recipient.id,
                        phone: recipient.phone,
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
                    closedAt: null
                }
            });
        }

        return prisma.conversation.create({
            data: {
                workspaceId: params.workspaceId,
                contactId: params.contactId,
                status: ConversationStatus.OPEN,
                operationalStatus: ConversationOperationalStatus.UNASSIGNED,
                source: ConversationSource.CAMPAIGN,
                lastMessageAt: new Date()
            }
        });
    }
}
