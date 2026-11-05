import {
    ConversationOperationalStatus,
    ConversationStatus,
    LogLevel,
    LogModule,
    UserRole,
    UserStatus
} from "@prisma/client";

import { prisma } from "../config/prisma";
import { emitToWorkspace, emitToWorkspaceAndUsers } from "../sockets";
import { AssigneeCandidate, pickAssignee } from "../utils/assignment";
import { BadgeService } from "./badge.service";
import { LogService } from "./log.service";

type AssignLeastBusyParams = {
    workspaceId: string;
    conversationId: string;
    assignedById?: string | null;
};

export class AssignmentService {
    /**
     * Candidatos a recibir la conversación, con su carga calculada.
     * Incluye agentes ACTIVOS (AVAILABLE o BUSY) y administradores con
     * sesión activa (estén o no marcados como OFFLINE).
     */
    private static async collectCandidates(workspaceId: string) {
        const now = new Date();

        const [agents, admins] = await Promise.all([
            prisma.user.findMany({
                where: {
                    workspaceId,
                    role: UserRole.AGENT,
                    isActive: true,
                    status: { in: [UserStatus.AVAILABLE, UserStatus.BUSY] }
                },
                select: { id: true, name: true, role: true, status: true }
            }),
            prisma.user.findMany({
                where: {
                    workspaceId,
                    role: UserRole.ADMIN,
                    isActive: true,
                    sessions: {
                        some: { isActive: true, expiresAt: { gt: now } }
                    }
                },
                select: { id: true, name: true, role: true, status: true }
            })
        ]);

        const users = [...agents, ...admins];
        const ids = users.map((user) => user.id);

        if (ids.length === 0) {
            return [] as AssigneeCandidate[];
        }

        const loads = await prisma.conversation.groupBy({
            by: ["assignedUserId"],
            where: {
                workspaceId,
                assignedUserId: { in: ids },
                status: ConversationStatus.OPEN
            },
            _count: { _all: true }
        });

        const loadById = new Map<string, number>();

        for (const row of loads) {
            if (row.assignedUserId) {
                loadById.set(row.assignedUserId, row._count._all);
            }
        }

        return users.map((user) => ({
            id: user.id,
            name: user.name,
            role: user.role as "AGENT" | "ADMIN",
            status: user.status,
            load: loadById.get(user.id) ?? 0
        }));
    }

    static async assignLeastBusyAgent(params: AssignLeastBusyParams) {
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: params.conversationId,
                workspaceId: params.workspaceId
            },
            select: {
                id: true,
                assignedUserId: true,
                contact: { select: { customName: true, profileName: true, phone: true } }
            }
        });

        if (!conversation) {
            throw new Error("Conversación no encontrada.");
        }

        if (conversation.assignedUserId) {
            return prisma.conversation.findUniqueOrThrow({
                where: { id: conversation.id }
            });
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: params.workspaceId },
            select: { autoAssignToAdmin: true }
        });
        const candidates = await AssignmentService.collectCandidates(params.workspaceId);
        const decision = pickAssignee(candidates, workspace?.autoAssignToAdmin ?? true);
        const contactName =
            conversation.contact.customName ||
            conversation.contact.profileName ||
            conversation.contact.phone;

        if (decision.kind === "unassigned") {
            const updated = await prisma.conversation.update({
                where: { id: conversation.id },
                data: { operationalStatus: ConversationOperationalStatus.UNASSIGNED }
            });

            await LogService.create({
                workspaceId: params.workspaceId,
                level: LogLevel.WARN,
                module: LogModule.CONVERSATION,
                action: "HANDOFF_UNASSIGNED",
                message: "No hay agente disponible: la conversación quedó sin asignar.",
                payload: { conversationId: conversation.id }
            }).catch(() => undefined);

            emitToWorkspace(params.workspaceId, "conversation:unassigned", {
                conversationId: conversation.id,
                contactName
            });

            await BadgeService.broadcast(params.workspaceId);

            return updated;
        }

        const updated = await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
                assignedUserId: decision.userId,
                operationalStatus: ConversationOperationalStatus.ASSIGNED,
                status: ConversationStatus.OPEN,
                closedAt: null
            }
        });

        await prisma.assignmentHistory.create({
            data: {
                conversationId: conversation.id,
                fromUserId: null,
                toUserId: decision.userId,
                assignedById: params.assignedById || decision.userId,
                reason: decision.step
            }
        });

        const fallback = decision.step !== "AVAILABLE_LEAST_BUSY";
        const action = fallback ? "HANDOFF_ASSIGNED_FALLBACK" : "AUTO_ASSIGN_LEAST_BUSY";

        await LogService.create({
            workspaceId: params.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.CONVERSATION,
            action,
            message: fallback
                ? "La conversación se asignó por fallback de handoff."
                : "Conversación asignada automáticamente al agente con menos carga.",
            payload: {
                conversationId: conversation.id,
                toUserId: decision.userId,
                step: decision.step
            }
        }).catch(() => undefined);

        emitToWorkspaceAndUsers(
            params.workspaceId,
            [decision.userId],
            "conversation:assigned",
            {
                conversationId: conversation.id,
                assignedUserId: decision.userId,
                contactName,
                reason: decision.step,
                fallback
            }
        );

        await BadgeService.broadcast(params.workspaceId);

        return updated;
    }
}