import { Request, Response } from "express";
import { UserStatus } from "@prisma/client";

import { AgentService } from "../services/agent.service";
import { DashboardService } from "../services/dashboard.service";

export class AgentDashboardController {
    static async index(req: Request, res: Response) {
        const dashboard = await DashboardService.getAgentDashboard(
            req.user!.workspaceId,
            req.user!.id
        );

        return res.render("pages/agent/dashboard", {
            user: req.user,
            dashboard,
            success: req.query.success || null,
            error: req.query.error || null
        });
    }

    static async updateStatus(req: Request, res: Response) {
        try {
            const status = req.body.status as UserStatus;

            await AgentService.updateStatus(req.user!.id, status);

            return res.redirect("/agent/dashboard?success=status");
        } catch {
            return res.redirect("/agent/dashboard?error=status");
        }
    }
}