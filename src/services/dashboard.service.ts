import {
    ConversationOperationalStatus,
    ConversationStatus,
    LogLevel,
    MessageDirection,
    UserRole,
    UserStatus
} from "@prisma/client";

import { prisma } from "../config/prisma";

export class DashboardService {
    static async getAdminDashboard(workspaceId: string) {
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
                    status: ConversationStatus.OPEN
                }
            }),

            prisma.conversation.count({
                where: {
                    workspaceId,
                    status: ConversationStatus.OPEN,
                    operationalStatus: ConversationOperationalStatus.UNASSIGNED
                }
            }),

            prisma.conversation.count({
                where: {
                    workspaceId,
                    status: ConversationStatus.OPEN,
                    operationalStatus: ConversationOperationalStatus.ASSIGNED
                }
            }),

            prisma.conversation.count({
                where: {
                    workspaceId,
                    status: ConversationStatus.OPEN,
                    operationalStatus: ConversationOperationalStatus.IN_PROGRESS
                }
            }),

            prisma.message.findMany({
                where: {
                    workspaceId,
                    direction: MessageDirection.IN
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
                    status: ConversationStatus.OPEN
                },
                include: {
                    contact: true,
                    assignedUser: true,
                    messages: {
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

        return {
            stats: {
                openConversations,
                unassignedConversations,
                assignedConversations,
                inProgressConversations
            },
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
                    status: true
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

        return {
            currentAgent,
            stats: {
                assignedOpenConversations,
                inProgressConversations
            },
            recentMessages,
            recentConversations
        };
    }
}
