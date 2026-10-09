import axios from "axios";
import { LogLevel, LogModule, Prisma } from "@prisma/client";

import { prisma } from "../config/prisma";
import { LogService } from "./log.service";

type MetaTemplate = {
    id?: string;
    name?: string;
    language?: string;
    category?: string;
    status?: string;
    components?: unknown;
};

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class TemplateService {
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
                `https://graph.facebook.com/${account.apiVersion}/${account.businessAccountId}/message_templates`,
                {
                    params: {
                        access_token: account.accessToken,
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