import { LogLevel, LogModule } from "@prisma/client";

import { prisma } from "../config/prisma";
import { appConfig } from "../config/app.config";
import { isEncrypted } from "../utils/crypto";

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
            recentMetaLogs,
            pendingWebhookEvents,
            failedWebhookEvents
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
            }),

            prisma.webhookEvent.count({
                where: {
                    status: "PENDING"
                }
            }),

            prisma.webhookEvent.count({
                where: {
                    status: "FAILED"
                }
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
            pendingWebhookEvents,
            failedWebhookEvents,
            /**
             * Estado del endurecimiento de seguridad de esta instalación.
             * Se muestra en el panel para detectar configuraciones faltantes.
             */
            hardening: {
                encryptionKeyConfigured: Boolean(appConfig.encryptionKey),
                credentialsEncrypted: whatsappAccount
                    ? isEncrypted(whatsappAccount.accessToken) &&
                      isEncrypted(whatsappAccount.verifyToken)
                    : false,
                webhookSignatureConfigured: Boolean(appConfig.metaAppSecret),
                webhookQueueEnabled: appConfig.webhookQueueEnabled,
                webhookWorkerIntervalMs: appConfig.webhookWorkerIntervalMs,
                webhookMaxAttempts: appConfig.webhookMaxAttempts,
                alertsConfigured: Boolean(appConfig.alertWebhookUrl),
                loginMaxAttempts: appConfig.loginMaxAttempts,
                loginLockMinutes: appConfig.loginLockMinutes,
                logRetentionDays: appConfig.logRetentionDays,
                webhookEventRetentionDays: appConfig.webhookEventRetentionDays
            },
            checks: {
                workspaceReady: Boolean(workspace),
                whatsappConfigured: Boolean(whatsappAccount),
                hasApprovedTemplates: approvedTemplates > 0,
                hasContacts: totalContacts > 0,
                hasAgents: activeAgents > 0,
                webhookHealthy: failedWebhookEvents === 0
            }
        };
    }
}
