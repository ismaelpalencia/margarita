import { UserRole, UserStatus } from "@prisma/client";

import { prisma } from "../config/prisma";
import { SendPolicyService } from "./send-policy.service";

export class AgentService {
    static async getAgentDashboard(userId: string) {
        const agent = await prisma.user.findUnique({
            where: {
                id: userId
            },
            select: {
                id: true,
                workspaceId: true,
                name: true,
                email: true,
                status: true,
                canSendManualMessages: true,
                manualMessageLimit: true,
                workspace: {
                    select: {
                        settings: {
                            select: {
                                maxManualMessages: true
                            }
                        }
                    }
                }
            }
        });

        if (!agent) {
            throw new Error("Agente no encontrado.");
        }

        const assignedConversations = await prisma.conversation.count({
            where: {
                assignedUserId: userId,
                status: "OPEN"
            }
        });

        const manualMessageLimit =
            agent.manualMessageLimit ??
            agent.workspace.settings?.maxManualMessages ??
            0;

        /**
         * El uso de hoy se cuenta desde los mensajes enviados, no de un
         * acumulado: así el número siempre cuadra con lo que hay en la
         * conversación y se reinicia solo a medianoche.
         */
        const usage = await SendPolicyService.usageToday({
            id: agent.id,
            role: UserRole.AGENT,
            workspaceId: agent.workspaceId,
            canSendManualMessages: agent.canSendManualMessages,
            manualMessageLimit: agent.manualMessageLimit
        });

        return {
            agent,
            stats: {
                assignedConversations,
                manualMessagesUsed: usage.used,
                manualMessageLimit,
                manualMessagesRemaining: usage.remaining
            }
        };
    }

    static async updateStatus(userId: string, status: UserStatus) {
        const user = await prisma.user.findUnique({
            where: {
                id: userId
            }
        });

        if (!user) {
            throw new Error("Usuario no encontrado.");
        }

        if (user.role !== UserRole.AGENT) {
            throw new Error("Solo los agentes pueden cambiar estado operativo.");
        }

        if (!user.isActive) {
            throw new Error("El usuario está desactivado.");
        }

        return prisma.user.update({
            where: {
                id: userId
            },
            data: {
                status
            }
        });
    }
}
