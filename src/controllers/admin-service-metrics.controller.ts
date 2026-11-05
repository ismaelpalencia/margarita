import { Request, Response } from "express";

import { prisma } from "../config/prisma";
import { AiUsageService } from "../services/aiUsage.service";
import { ServiceMetricsService } from "../services/service-metrics.service";

export class AdminServiceMetricsController {
    private static async timezoneFor(workspaceId: string) {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                settings: { select: { timezone: true } },
                feedbackEnabled: true
            }
        });

        return workspace?.settings?.timezone || "America/Mexico_City";
    }

    static async index(req: Request, res: Response) {
        const timezone = await this.timezoneFor(req.user!.workspaceId);
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

    /** Consumo mensual de IA: vista del operador, siempre completa. */
    static async aiUsage(req: Request, res: Response) {
        const timezone = await this.timezoneFor(req.user!.workspaceId);
        const [current, report] = await Promise.all([
            AiUsageService.getCurrentMonthUsage(req.user!.workspaceId, timezone),
            AiUsageService.getMonthlyReport(req.user!.workspaceId, 12)
        ]);

        return res.render("pages/admin/service-metrics/ai-usage", {
            user: req.user,
            timezone,
            current,
            report
        });
    }

    static async exportAiUsage(_req: Request, res: Response) {
        const workspaceId = _req.user!.workspaceId;
        const report = await AiUsageService.getMonthlyReport(workspaceId, 12);
        const header = [
            "anio",
            "mes",
            "respuestas",
            "sugerencias",
            "incluidas",
            "excedente",
            "costo_excedente_mxn"
        ];
        const rows = report.map((row) =>
            [
                row.year,
                row.month,
                row.replyCount,
                row.suggestCount,
                row.limit,
                row.overage,
                row.overageCost
            ].join(",")
        );

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
            "Content-Disposition",
            'attachment; filename="consumo-ia.csv"'
        );

        return res.send([header.join(","), ...rows].join("\n"));
    }
}