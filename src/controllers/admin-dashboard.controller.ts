import { Request, Response } from "express";
import { ConversationStatus } from "@prisma/client";

import { prisma } from "../config/prisma";
import { DashboardService } from "../services/dashboard.service";
import { ConversationService } from "../services/conversation.service";

export class AdminDashboardController {
    static async index(req: Request, res: Response) {
        const workspaceId = req.user!.workspaceId;
        const dashboard = await DashboardService.getAdminDashboard(
            workspaceId,
            req.activeNumber?.id
        );

        /**
         * El dashboard es por número: una entrega de la IA del número activo
         * no debe mezclarse con la del otro número. Sin este filtro, el mismo
         * contacto aparecía dos veces si tenía hilos abiertos en ambos.
         */
        const numberFilter = req.activeNumber
            ? { whatsappNumberId: req.activeNumber.id }
            : {};

        const [unassignedCount, handoffs, handoffCount] = await Promise.all([
            ConversationService.countUnassigned(workspaceId),
            prisma.conversation.findMany({
                where: {
                    workspaceId,
                    status: ConversationStatus.OPEN,
                    aiHandoffAt: { not: null },
                    ...numberFilter
                },
                orderBy: { aiHandoffAt: "desc" },
                take: 10,
                select: {
                    id: true,
                    aiHandoffAt: true,
                    aiHandoffReason: true,
                    assignedUserId: true,
                    contact: {
                        select: {
                            customName: true,
                            profileName: true,
                            phone: true
                        }
                    },
                    assignedUser: { select: { name: true } }
                }
            }),
            prisma.conversation.count({
                where: {
                    workspaceId,
                    status: ConversationStatus.OPEN,
                    aiHandoffAt: { not: null },
                    ...numberFilter
                }
            })
        ]);

        return res.render("pages/admin/dashboard", {
            user: req.user,
            dashboard,
            unassignedCount,
            handoffs,
            handoffCount,
            activeNumber: req.activeNumber || null,
            error: req.query.error || null
        });
    }
}