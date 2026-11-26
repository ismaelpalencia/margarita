import { ConversationStatus, UserRole } from "@prisma/client";

import { prisma } from "../config/prisma";
import { emitToUsers, emitToWorkspace } from "../sockets";

export type BadgePayload = {
    dashboardUnread: number;
    myUnread: number;
    unassigned: number;
    unreadByNumber: Record<string, number>;
};

/**
 * Contadores de badges calculados en el servidor y enviados por socket.
 * Así dos pestañas y varios usuarios no se desincronizan sumando o restando
 * en el navegador.
 */
export class BadgeService {
    static async broadcast(workspaceId: string) {
        const [totalUnread, unassigned, perAgent, perAgentNumber, adminUnreadByNumber] = await Promise.all([
            prisma.conversation.aggregate({
                where: { workspaceId, unreadCount: { gt: 0 } },
                _sum: { unreadCount: true }
            }),
            prisma.conversation.count({
                where: {
                    workspaceId,
                    assignedUserId: null,
                    status: ConversationStatus.OPEN
                }
            }),
            prisma.conversation.groupBy({
                by: ["assignedUserId"],
                where: {
                    workspaceId,
                    unreadCount: { gt: 0 },
                    assignedUserId: { not: null }
                },
                _sum: { unreadCount: true }
            }),
            prisma.conversation.groupBy({
                by: ["assignedUserId", "whatsappNumberId"],
                where: { workspaceId, unreadCount: { gt: 0 }, assignedUserId: { not: null } },
                _sum: { unreadCount: true }
            }),
            prisma.conversation.groupBy({
                by: ["whatsappNumberId"],
                where: { workspaceId, unreadCount: { gt: 0 } },
                _sum: { unreadCount: true }
            })
        ]);

        const total = totalUnread._sum.unreadCount ?? 0;
        const loadByAgent = new Map<string, number>();

        for (const row of perAgent) {
            if (row.assignedUserId) {
                loadByAgent.set(row.assignedUserId, row._sum.unreadCount ?? 0);
            }
        }

        /** Administradores: ven todo el workspace. */
        emitToWorkspace(workspaceId, "badges:update", {
            dashboardUnread: total,
            myUnread: total,
            unassigned,
            unreadByNumber: Object.fromEntries(adminUnreadByNumber.map((row) => [row.whatsappNumberId, row._sum.unreadCount ?? 0]))
        } satisfies BadgePayload);

        /** Agentes: el suyo es solo lo que tienen asignado. */
        const agents = await prisma.user.findMany({
            where: { workspaceId, role: UserRole.AGENT, isActive: true },
            select: { id: true, allowedNumberIds: true }
        });

        for (const agent of agents) {
            const mine = loadByAgent.get(agent.id) ?? 0;
            const numberCounts = perAgentNumber.filter((row) => row.assignedUserId === agent.id);

            emitToUsers([agent.id], "badges:update", {
                dashboardUnread: mine,
                myUnread: mine,
                unassigned,
                unreadByNumber: Object.fromEntries(numberCounts
                    .filter((row) => !agent.allowedNumberIds.length || agent.allowedNumberIds.includes(row.whatsappNumberId))
                    .map((row) => [row.whatsappNumberId, row._sum.unreadCount ?? 0]))
            } satisfies BadgePayload);
        }
    }
}
