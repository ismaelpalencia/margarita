import {
    ConversationOperationalStatus,
    ConversationStatus,
    LogLevel,
    MessageDirection,
    UserRole,
    UserStatus
} from "@prisma/client";

import { prisma } from "../config/prisma";
import { SendPolicyService } from "./send-policy.service";
import { ReportService } from "./report.service";

export class DashboardService {
    static async getAdminDashboard(workspaceId: string, numberId?: string) {
        /**
         * El dashboard es **por número**: al cambiarlo en el encabezado, las
         * conversaciones, los mensajes y los conteos cambian con él. Los
         * contactos siguen siendo de la empresa (uno por deudor).
         */
        const porNumero = numberId ? { whatsappNumberId: numberId } : {};
        const mensajesDelNumero = numberId
            ? { conversation: { whatsappNumberId: numberId } }
            : {};
        const [
            openConversations,
            unassignedConversations,
            assignedConversations,
            inProgressConversations,
            recentIncomingMessages,
            agentStatusCounts,
            recentErrors,
            recentConversations
        ] = await Promise.all([
            prisma.conversation.count({
                where: {
                    workspaceId,
                    status: ConversationStatus.OPEN,
                    ...porNumero
                }
            }),

            prisma.conversation.count({
                where: {
                    workspaceId,
                    status: ConversationStatus.OPEN,
                    operationalStatus: ConversationOperationalStatus.UNASSIGNED,
                    ...porNumero
                }
            }),

            prisma.conversation.count({
                where: {
                    workspaceId,
                    status: ConversationStatus.OPEN,
                    operationalStatus: ConversationOperationalStatus.ASSIGNED,
                    ...porNumero
                }
            }),

            prisma.conversation.count({
                where: {
                    workspaceId,
                    status: ConversationStatus.OPEN,
                    operationalStatus: ConversationOperationalStatus.IN_PROGRESS,
                    ...porNumero
                }
            }),

            prisma.message.findMany({
                where: {
                    workspaceId,
                    direction: MessageDirection.IN,
                    /**
                     * Un mensaje oculto no debe reaparecer en el dashboard:
                     * era justo lo que pasaba al borrar un chat desde el hilo.
                     */
                    deletedAt: null
                },
                include: {
                    conversation: {
                        include: {
                            contact: true,
                            assignedUser: true
                        }
                    }
                },
                orderBy: {
                    createdAt: "desc"
                },
                take: 5
            }),

            prisma.user.groupBy({
                by: ["status"],
                where: {
                    workspaceId,
                    role: UserRole.AGENT,
                    isActive: true
                },
                _count: {
                    status: true
                }
            }),

            prisma.log.findMany({
                where: {
                    workspaceId,
                    level: {
                        in: [LogLevel.ERROR, LogLevel.WARN]
                    }
                },
                orderBy: {
                    createdAt: "desc"
                },
                take: 5
            }),

            prisma.conversation.findMany({
                where: {
                    workspaceId,
                    status: ConversationStatus.OPEN,
                    ...porNumero
                },
                include: {
                    contact: true,
                    assignedUser: true,
                    messages: {
                        where: { deletedAt: null },
                        orderBy: {
                            createdAt: "desc"
                        },
                        take: 1
                    }
                },
                orderBy: [
                    {
                        lastMessageAt: "desc"
                    },
                    {
                        createdAt: "desc"
                    }
                ],
                take: 5
            })
        ]);

        const statusMap = {
            [UserStatus.AVAILABLE]: 0,
            [UserStatus.BUSY]: 0,
            [UserStatus.BREAK]: 0,
            [UserStatus.OFFLINE]: 0
        };

        agentStatusCounts.forEach((item) => {
            statusMap[item.status] = item._count.status;
        });

        /** Números de cobranza del día, para no tener que abrir Reportes. */
        const outcomes = await ReportService.outcomeSummary(workspaceId);

        return {
            stats: {
                openConversations,
                unassignedConversations,
                assignedConversations,
                inProgressConversations
            },
            outcomes,
            agents: {
                available: statusMap[UserStatus.AVAILABLE],
                busy: statusMap[UserStatus.BUSY],
                break: statusMap[UserStatus.BREAK],
                offline: statusMap[UserStatus.OFFLINE]
            },
            recentIncomingMessages,
            recentErrors,
            recentConversations
        };
    }

    static async getAgentDashboard(workspaceId: string, userId: string) {
        const [
            currentAgent,
            assignedOpenConversations,
            inProgressConversations,
            recentMessages,
            recentConversations
        ] = await Promise.all([
            prisma.user.findFirst({
                where: {
                    id: userId,
                    workspaceId
                },
                select: {
                    id: true,
                    name: true,
                    status: true,
                    canSendManualMessages: true,
                    manualMessageLimit: true
                }
            }),

            prisma.conversation.count({
                where: {
                    workspaceId,
                    assignedUserId: userId,
                    status: ConversationStatus.OPEN
                }
            }),

            prisma.conversation.count({
                where: {
                    workspaceId,
                    assignedUserId: userId,
                    status: ConversationStatus.OPEN,
                    operationalStatus: ConversationOperationalStatus.IN_PROGRESS
                }
            }),

            prisma.message.findMany({
                where: {
                    workspaceId,
                    deletedAt: null,
                    conversation: {
                        assignedUserId: userId
                    }
                },
                include: {
                    conversation: {
                        include: {
                            contact: true
                        }
                    }
                },
                orderBy: {
                    createdAt: "desc"
                },
                take: 5
            }),

            prisma.conversation.findMany({
                where: {
                    workspaceId,
                    assignedUserId: userId,
                    status: ConversationStatus.OPEN
                },
                include: {
                    contact: true,
                    messages: {
                        where: { deletedAt: null },
                        orderBy: {
                            createdAt: "desc"
                        },
                        take: 1
                    }
                },
                orderBy: [
                    {
                        lastMessageAt: "desc"
                    },
                    {
                        createdAt: "desc"
                    }
                ],
                take: 5
            })
        ]);

        /**
         * Uso de hoy y tope efectivo del agente (el suyo o el de la
         * empresa). Se calcula después porque depende de lo que se acaba
         * de leer del usuario.
         */
        const manualUsage = await SendPolicyService.usageToday({
            id: userId,
            role: UserRole.AGENT,
            workspaceId,
            canSendManualMessages: Boolean(currentAgent?.canSendManualMessages),
            manualMessageLimit: currentAgent?.manualMessageLimit ?? null
        });

        return {
            currentAgent,
            stats: {
                assignedOpenConversations,
                inProgressConversations,
                manualMessagesToday: manualUsage.used,
                manualMessageLimit: manualUsage.limit
            },
            recentMessages,
            recentConversations
        };
    }
}
