import bcrypt from "bcrypt";
import { UserRole, UserStatus } from "@prisma/client";

import { prisma } from "../config/prisma";
import {
    CreateAgentInput,
    UpdateAgentInput
} from "../validations/user.validation";

export class UserService {
    static async listAgents(workspaceId: string) {
        return prisma.user.findMany({
            where: {
                workspaceId,
                role: UserRole.AGENT
            },
            orderBy: {
                createdAt: "desc"
            }
        });
    }

    static async listActiveAgents(workspaceId: string) {
        return prisma.user.findMany({
            where: {
                workspaceId,
                role: UserRole.AGENT,
                isActive: true
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

    static async createAgent(workspaceId: string, input: CreateAgentInput) {
        const existingUser = await prisma.user.findUnique({
            where: {
                email: input.email
            }
        });

        if (existingUser) {
            throw new Error("Ya existe un usuario con ese correo.");
        }

        const passwordHash = await bcrypt.hash(input.password, 12);

        return prisma.user.create({
            data: {
                workspaceId,
                name: input.name,
                email: input.email,
                password: passwordHash,
                role: UserRole.AGENT,
                status: UserStatus.OFFLINE,
                isActive: true,
                canSendManualMessages: input.canSendManualMessages,
                manualMessageLimit: input.manualMessageLimit,
                manualMessagesUsed: 0
            }
        });
    }

    static async getAgentById(workspaceId: string, agentId: string) {
        const agent = await prisma.user.findFirst({
            where: {
                id: agentId,
                workspaceId,
                role: UserRole.AGENT
            }
        });

        if (!agent) {
            throw new Error("Agente no encontrado.");
        }

        return agent;
    }

    static async updateAgent(
        workspaceId: string,
        agentId: string,
        input: UpdateAgentInput
    ) {
        await this.getAgentById(workspaceId, agentId);

        return prisma.user.update({
            where: {
                id: agentId
            },
            data: {
                name: input.name,
                canSendManualMessages: input.canSendManualMessages,
                manualMessageLimit: input.manualMessageLimit
            }
        });
    }

    static async toggleAgentStatus(workspaceId: string, agentId: string) {
        const agent = await this.getAgentById(workspaceId, agentId);

        const nextIsActive = !agent.isActive;

        return prisma.user.update({
            where: {
                id: agent.id
            },
            data: {
                isActive: nextIsActive,
                status: nextIsActive ? agent.status : UserStatus.OFFLINE
            }
        });
    }
}
