import axios from "axios";
import { LogLevel, LogModule, Prisma } from "@prisma/client";

import { prisma } from "../config/prisma";
import { decryptSecret } from "../utils/crypto";
import { appConfig } from "../config/app.config";
import { LogService } from "./log.service";
import {
    buildTemplateComponents,
    NewTemplateInput
} from "../utils/template";

type MetaTemplate = {
    id?: string;
    name?: string;
    language?: string;
    category?: string;
    status?: string;
    components?: unknown;
    quality_score?: string | { score?: string };
};

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class TemplateService {
    static async getTemplateQuality(workspaceId: string) {
        const account = await prisma.whatsAppAccount.findUnique({ where: { workspaceId } });
        if (!account) throw new Error("No hay cuenta de WhatsApp configurada.");
        const accessToken = decryptSecret(account.accessToken);
        const response = await axios.get(
            `${appConfig.graphBaseUrl}/${account.apiVersion}/${account.businessAccountId}/message_templates`,
            { params: { fields: "id,name,language,status,quality_score", limit: 100 }, headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 }
        );
        const templates = Array.isArray(response.data?.data) ? response.data.data as MetaTemplate[] : [];
        return templates.filter((template) => template.name && template.language).map((template) => ({
            name: template.name!,
            language: template.language!,
            status: template.status || "UNKNOWN",
            qualityScore: typeof template.quality_score === "string" ? template.quality_score : template.quality_score?.score || "UNKNOWN"
        }));
    }

    static async listTemplates(workspaceId: string) {
        return prisma.template.findMany({
            where: {
                workspaceId
            },
            orderBy: [
                {
                    status: "asc"
                },
                {
                    name: "asc"
                }
            ]
        });
    }

    static async listApprovedTemplates(workspaceId: string) {
        return prisma.template.findMany({
            where: {
                workspaceId,
                status: "APPROVED"
            },
            orderBy: {
                name: "asc"
            }
        });
    }

    /**
     * Alias para mantener compatibilidad con tu AdminTemplatesController actual.
     */
    static async syncTemplates(workspaceId: string) {
        return this.syncTemplatesFromMeta(workspaceId);
    }

    static async createTemplate(workspaceId: string, input: NewTemplateInput) {
        const account = await prisma.whatsAppAccount.findUnique({
            where: { workspaceId }
        });

        if (!account) {
            throw new Error("No hay cuenta de WhatsApp configurada.");
        }

        const components = buildTemplateComponents(input);

        try {
            const response = await axios.post(
                `${appConfig.graphBaseUrl}/${account.apiVersion}/${account.businessAccountId}/message_templates`,
                {
                    name: input.name,
                    language: input.language,
                    category: input.category,
                    components
                },
                {
                    params: { access_token: decryptSecret(account.accessToken) },
                    timeout: 15000
                }
            );

            const template = await prisma.template.upsert({
                where: {
                    workspaceId_name_language: {
                        workspaceId,
                        name: input.name,
                        language: input.language
                    }
                },
                update: {
                    metaTemplateId: response.data?.id || null,
                    category: response.data?.category || input.category,
                    status: response.data?.status || "PENDING",
                    components: toPrismaJson(response.data?.components || components),
                    lastSyncedAt: new Date()
                },
                create: {
                    workspaceId,
                    metaTemplateId: response.data?.id || null,
                    name: input.name,
                    language: input.language,
                    category: response.data?.category || input.category,
                    status: response.data?.status || "PENDING",
                    components: toPrismaJson(response.data?.components || components),
                    lastSyncedAt: new Date()
                }
            });

            await LogService.create({
                workspaceId,
                level: LogLevel.INFO,
                module: LogModule.META,
                action: "TEMPLATE_CREATED",
                message: "Se creó una plantilla en Meta.",
                payload: { templateId: template.id, name: template.name }
            }).catch(() => undefined);

            return template;
        } catch (error) {
            const message = axios.isAxiosError(error)
                ? error.response?.data?.error?.message || error.message
                : error instanceof Error
                  ? error.message
                  : "No se pudo crear la plantilla.";

            throw new Error(message);
        }
    }

    static async deleteTemplate(workspaceId: string, templateId: string) {
        const account = await prisma.whatsAppAccount.findUnique({
            where: { workspaceId }
        });
        const template = await prisma.template.findFirst({
            where: { id: templateId, workspaceId }
        });

        if (!template) {
            throw new Error("Plantilla no encontrada.");
        }

        if (account) {
            await axios.delete(
                `${appConfig.graphBaseUrl}/${account.apiVersion}/${account.businessAccountId}/message_templates`,
                {
                    params: {
                        access_token: decryptSecret(account.accessToken),
                        name: template.name
                    },
                    timeout: 15000
                }
            );
        }

        await prisma.template.delete({ where: { id: template.id } });

        await LogService.create({
            workspaceId,
            level: LogLevel.WARN,
            module: LogModule.META,
            action: "TEMPLATE_DELETED",
            message: "Se eliminó una plantilla.",
            payload: { templateId: template.id, name: template.name }
        }).catch(() => undefined);
    }

    static async syncTemplatesFromMeta(workspaceId: string) {
        const account = await prisma.whatsAppAccount.findUnique({
            where: {
                workspaceId
            }
        });

        if (!account) {
            throw new Error("No hay cuenta de WhatsApp configurada.");
        }

        try {
            const response = await axios.get(
                `${appConfig.graphBaseUrl}/${account.apiVersion}/${account.businessAccountId}/message_templates`,
                {
                    params: {
                        access_token: decryptSecret(account.accessToken),
                        fields: "id,name,language,category,status,components"
                    },
                    timeout: 15000
                }
            );

            const templates = Array.isArray(response.data?.data)
                ? (response.data.data as MetaTemplate[])
                : [];

            for (const template of templates) {
                if (!template.name || !template.language) {
                    continue;
                }

                await prisma.template.upsert({
                    where: {
                        workspaceId_name_language: {
                            workspaceId,
                            name: template.name,
                            language: template.language
                        }
                    },
                    update: {
                        metaTemplateId: template.id || null,
                        category: template.category || null,
                        status: template.status || "UNKNOWN",
                        components: toPrismaJson(template.components || [])
                    },
                    create: {
                        workspaceId,
                        metaTemplateId: template.id || null,
                        name: template.name,
                        language: template.language,
                        category: template.category || null,
                        status: template.status || "UNKNOWN",
                        components: toPrismaJson(template.components || [])
                    }
                });
            }

            await LogService.create({
                workspaceId,
                level: LogLevel.INFO,
                module: LogModule.META,
                action: "TEMPLATES_SYNC_SUCCESS",
                message: "Plantillas sincronizadas correctamente desde Meta.",
                payload: {
                    count: templates.length
                }
            });

            return {
                count: templates.length
            };
        } catch (error) {
            const payload = axios.isAxiosError(error)
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

            await LogService.create({
                workspaceId,
                level: LogLevel.ERROR,
                module: LogModule.META,
                action: "TEMPLATES_SYNC_FAILED",
                message: "No se pudieron sincronizar las plantillas desde Meta.",
                payload
            });

            throw new Error("No se pudieron sincronizar las plantillas.");
        }
    }
}
