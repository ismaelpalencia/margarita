import { Request, Response } from "express";

import { prisma } from "../config/prisma";
import { ServiceMetricsService } from "../services/service-metrics.service";

export class AdminServiceMetricsController {
    static async index(req: Request, res: Response) {
        const workspace = await prisma.workspace.findUnique({
            where: { id: req.user!.workspaceId },
            select: {
                settings: { select: { timezone: true } },
                feedbackEnabled: true
            }
        });

        const timezone = workspace?.settings?.timezone || "America/Mexico_City";
        const metrics = await ServiceMetricsService.summary(
            req.user!.workspaceId,
            timezone
        );

        return res.render("pages/admin/service-metrics/index", {
            user: req.user,
            metrics,
            timezone
        });
    }
}