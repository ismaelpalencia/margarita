import { Request, Response } from "express";

import { DashboardService } from "../services/dashboard.service";

export class AdminDashboardController {
    static async index(req: Request, res: Response) {
        const dashboard = await DashboardService.getAdminDashboard(
            req.user!.workspaceId
        );

        return res.render("pages/admin/dashboard", {
            user: req.user,
            dashboard
        });
    }
}
