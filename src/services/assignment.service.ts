import {
    ConversationOperationalStatus,
    ConversationStatus,
    LogLevel,
    LogModule,
    UserRole,
    UserStatus
} from "@prisma/client";

import { prisma } from "../config/prisma";
import { emitToWorkspaceAndUsers } from "../sockets";
import { LogService } from "./log.service";

type AssignLeastBusyParams = {
    workspaceId: string;
    conversationId: string;
    assignedById?: string | null;
};

export class AssignmentService {
    static async assignLeastBusyAgent(params: AssignLeastBusyParams) {
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: params.conversationId,
                workspaceId: params.workspaceId
            }
        });

        if (!conversation) {
            throw new Error("Conversación no encontrada.");
        }

        if (conversation.assignedUserId) {
            return conversation;
        }

        const availableAgents = await prisma.user.findMany({
            where: {
                workspaceId: params.workspaceId,
                role: UserRole.AGENT,
                isActive: true,
                status: UserStatus.AVAILABLE
            },
            select: {
                id: true,
                name: true
            },
            orderBy: {
                name: "asc"
            }
        });

        if (availableAgents.length === 0) {
            return prisma.conversation.update({
                where: {
                    id: conversation.id
                },
                data: {
                    operationalStatus: ConversationOperationalStatus.UNASSIGNED
                }
            });
        }

        const agentsWithCounts = await Promise.all(
            availableAgents.map(async (agent) => {
                const openConversations = await prisma.conversation.count({
                    where: {
                        workspaceId: params.workspaceId,
                        assignedUserId: agent.id,
                        status: ConversationStatus.OPEN
                    }
                });

                return {
                    ...agent,
                    openConversations
                };
            })
        );

        const selectedAgent = agentsWithCounts.sort((a, b) => {
            if (a.openConversations !== b.openConversations) {
                return a.openConversations - b.openConversations;
            }

            return a.name.localeCompare(b.name);
        })[0];

        const updatedConversation = await prisma.conversation.update({
            where: {
                id: conversation.id
            },
            data: {
                assignedUserId: selectedAgent.id,
                operationalStatus: ConversationOperationalStatus.ASSIGNED,
                status: ConversationStatus.OPEN,
                closedAt: null
            }
        });

        await prisma.assignmentHistory.create({
            data: {
                conversationId: conversation.id,
                fromUserId: null,
                toUserId: selectedAgent.id,
                assignedById: params.assignedById || selectedAgent.id,
                reason: "AUTO_LEAST_BUSY"
            }
        });

        await LogService.create({
            workspaceId: params.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.CONVERSATION,
            action: "AUTO_ASSIGN_LEAST_BUSY",
            message: "Conversación asignada automáticamente al agente con menos carga.",
            payload: {
                conversationId: conversation.id,
                toUserId: selectedAgent.id,
                openConversations: selectedAgent.openConversations
            }
        });

        emitToWorkspaceAndUsers(
            params.workspaceId,
            [selectedAgent.id],
            "conversation:assigned",
            {
                conversationId: conversation.id,
                assignedUserId: selectedAgent.id,
                agentName: selectedAgent.name,
                reason: "AUTO_LEAST_BUSY"
            }
        );

        return updatedConversation;
    }
}
