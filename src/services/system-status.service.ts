import { LogLevel, LogModule } from "@prisma/client";

import { prisma } from "../config/prisma";
import { appConfig } from "../config/app.config";
import { isEncrypted } from "../utils/crypto";
import { LEGACY_PHONE_HASH_PREFIX } from "../jobs/phone-hash.job";

export class SystemStatusService {
    /**
     * Estado del cifrado en reposo.
     *
     * Se consulta la base directamente (`$queryRaw`) a propósito: al pasar
     * por la extensión de Prisma los valores llegan descifrados, así que la
     * única forma de saber si lo que está guardado está cifrado es mirar
     * las columnas crudas.
     */
    private static async inspectEncryption(workspaceId: string) {
        try {
            const [
                credentials,
                plaintextContacts,
                plaintextMessages,
                pendingPhoneHashes
            ] = await Promise.all([
                prisma.$queryRaw<
                    Array<{ accessToken: string | null; verifyToken: string | null }>
                >`SELECT "accessToken", "verifyToken"
                    FROM "WhatsAppAccount"
                   WHERE "workspaceId" = ${workspaceId}
                   LIMIT 1`,

                prisma.$queryRaw<Array<{ total: bigint }>>`
                    SELECT count(*) AS total
                      FROM "Contact"
                     WHERE "workspaceId" = ${workspaceId}
                       AND "phone" NOT LIKE 'enc:v1:%'`,

                prisma.$queryRaw<Array<{ total: bigint }>>`
                    SELECT count(*) AS total
                      FROM "Message"
                     WHERE "workspaceId" = ${workspaceId}
                       AND "body" IS NOT NULL
                       AND "body" NOT LIKE 'enc:v1:%'`,

                prisma.contact.count({
                    where: {
                        workspaceId,
                        phoneHash: {
                            startsWith: LEGACY_PHONE_HASH_PREFIX
                        }
                    }
                })
            ]);

            const account = credentials[0];

            return {
                credentialsEncrypted: Boolean(
                    account &&
                        isEncrypted(account.accessToken) &&
                        isEncrypted(account.verifyToken)
                ),
                plaintextContacts: Number(plaintextContacts[0]?.total ?? 0),
                plaintextMessages: Number(plaintextMessages[0]?.total ?? 0),
                pendingPhoneHashes
            };
        } catch {
            /**
             * Si la consulta falla (por ejemplo, con una base a la que le
             * falta la migración) el panel no debe caerse: se reporta como
             * si no hubiera nada cifrado y así resalta el pendiente.
             */
            return {
                credentialsEncrypted: false,
                plaintextContacts: 0,
                plaintextMessages: 0,
                pendingPhoneHashes: 0
            };
        }
    }

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

        const encryption = await this.inspectEncryption(workspaceId);

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
                credentialsEncrypted: encryption.credentialsEncrypted,
                /** Filas que todavía quedaron guardadas en claro. */
                plaintextContacts: encryption.plaintextContacts,
                plaintextMessages: encryption.plaintextMessages,
                pendingPhoneHashes: encryption.pendingPhoneHashes,
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
