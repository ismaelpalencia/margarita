import { Request, Response } from "express";

import { DashboardService } from "../services/dashboard.service";
import { ConversationService } from "../services/conversation.service";

export class AdminDashboardController {
    static async index(req: Request, res: Response) {
        const dashboard = await DashboardService.getAdminDashboard(
            req.user!.workspaceId,
            req.activeNumber?.id
        );

        return res.render("pages/admin/dashboard", {
            user: req.user,
            dashboard,
            unassignedCount: await ConversationService.countUnassigned(
                req.user!.workspaceId
            ),
            activeNumber: req.activeNumber || null,
            error: req.query.error || null
        });
    }
}
