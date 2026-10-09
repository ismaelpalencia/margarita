import { LogLevel, LogModule } from "@prisma/client";

import { prisma } from "../config/prisma";
import { appConfig } from "../config/app.config";

export class SystemStatusService {
    static async getAdminStatus(workspaceId: string) {
        const [
            workspace,
            whatsappAccount,
            approvedTemplates,
            totalTemplates,
            totalContacts,
            activeAgents,
            recentErrors,
            recentWebhookLogs,
            recentMetaLogs
        ] = await Promise.all([
            prisma.workspace.findUnique({
                where: {
                    id: workspaceId
                },
                include: {
                    settings: true
                }
            }),

            prisma.whatsAppAccount.findUnique({
                where: {
                    workspaceId
                }
            }),

            prisma.template.count({
                where: {
                    workspaceId,
                    status: "APPROVED"
                }
            }),

            prisma.template.count({
                where: {
                    workspaceId
                }
            }),

            prisma.contact.count({
                where: {
                    workspaceId,
                    isActive: true
                }
            }),

            prisma.user.count({
                where: {
                    workspaceId,
                    role: "AGENT",
                    isActive: true
                }
            }),

            prisma.log.findMany({
                where: {
                    workspaceId,
                    level: LogLevel.ERROR
                },
                orderBy: {
                    createdAt: "desc"
                },
                take: 5
            }),

            prisma.log.findMany({
                where: {
                    workspaceId,
                    module: LogModule.WEBHOOK
                },
                orderBy: {
                    createdAt: "desc"
                },
                take: 5
            }),

            prisma.log.findMany({
                where: {
                    workspaceId,
                    module: LogModule.META
                },
                orderBy: {
                    createdAt: "desc"
                },
                take: 5
            })
        ]);

        const webhookUrl = `${appConfig.appUrl}/webhooks/meta/whatsapp`;

        return {
            workspace,
            whatsappAccount,
            approvedTemplates,
            totalTemplates,
            totalContacts,
            activeAgents,
            recentErrors,
            recentWebhookLogs,
            recentMetaLogs,
            webhookUrl,
            checks: {
                workspaceReady: Boolean(workspace),
                whatsappConfigured: Boolean(whatsappAccount),
                hasApprovedTemplates: approvedTemplates > 0,
                hasContacts: totalContacts > 0,
                hasAgents: activeAgents > 0
            }
        };
    }
}