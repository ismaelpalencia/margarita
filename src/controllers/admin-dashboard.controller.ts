import { Request, Response } from "express";
import { ConversationStatus } from "@prisma/client";

import { prisma } from "../config/prisma";
import { DashboardService } from "../services/dashboard.service";
import { ConversationService } from "../services/conversation.service";

async function getDashboardData(req: Request) {
    const workspaceId = req.user!.workspaceId;
    const dashboard = await DashboardService.getAdminDashboard(
        workspaceId,
        req.activeNumber?.id
    );

    /** El dashboard de handoffs respeta el número activo, igual que el EJS. */
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

    return { dashboard, unassignedCount, handoffs, handoffCount };
}

export class AdminDashboardController {
    static async index(req: Request, res: Response) {
        const data = await getDashboardData(req);

        return res.render("pages/admin/dashboard", {
            user: req.user,
            ...data,
            activeNumber: req.activeNumber || null,
            error: req.query.error || null
        });
    }

    static async data(req: Request, res: Response) {
        const data = await getDashboardData(req);

        return res.json({
            user: { name: req.user!.name, role: req.user!.role },
            activeNumber: req.activeNumber
                ? {
                      displayName: req.activeNumber.displayName,
                      phoneNumber: req.activeNumber.phoneNumber
                  }
                : null,
            ...data
        });
    }
}
