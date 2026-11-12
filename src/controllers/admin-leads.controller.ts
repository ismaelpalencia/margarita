import { LeadStatus } from "@prisma/client";
import { Request, Response } from "express";

import { prisma } from "../config/prisma";
import { LeadService } from "../services/lead.service";
import { getRequiredParam } from "../utils/request";

const STATUSES = [LeadStatus.NUEVO, LeadStatus.CONTACTADO, LeadStatus.CONVERTIDO, LeadStatus.DESCARTADO] as const;

export class AdminLeadsController {
    static async index(req: Request, res: Response) {
        const status = typeof req.query.status === "string" ? req.query.status : "ALL";
        const [leads, flags] = await Promise.all([
            LeadService.list(req.user!.workspaceId, status),
            prisma.workspace.findUniqueOrThrow({
                where: { id: req.user!.workspaceId },
                select: {
                    leadsEnabled: true,
                    leadWebhookUrl: true,
                    leadWebhookSecret: true
                }
            })
        ]);

        return res.render("pages/admin/leads/index", {
            user: req.user,
            leads,
            statuses: STATUSES,
            currentStatus: status,
            leadsEnabled: flags.leadsEnabled,
            leadWebhookUrl: flags.leadWebhookUrl ?? "",
            hasWebhookSecret: Boolean(flags.leadWebhookSecret),
            success: req.query.success || null,
            error: req.query.error || null
        });
    }

    static async saveSettings(req: Request, res: Response) {
        const leadsEnabled = req.body?.leadsEnabled === "true";
        const leadWebhookUrl = String(req.body?.leadWebhookUrl || "").trim();
        const leadWebhookSecret = String(req.body?.leadWebhookSecret || "").trim();

        try {
            await prisma.workspace.update({
                where: { id: req.user!.workspaceId },
                data: {
                    leadsEnabled,
                    leadWebhookUrl: leadWebhookUrl || null,
                    ...(leadWebhookSecret
                        ? { leadWebhookSecret }
                        : {})
                }
            });
        } catch {
            return res.redirect("/admin/leads?error=settings");
        }

        return res.redirect("/admin/leads?success=settings");
    }

    static async create(req: Request, res: Response) {
        const name = String(req.body?.name || "").trim();
        const phone = String(req.body?.phone || "").trim();
        const email = String(req.body?.email || "").trim();

        if (!name || !phone) {
            return res.redirect("/admin/leads?error=name_phone");
        }

        try {
            await LeadService.capture({
                workspaceId: req.user!.workspaceId,
                name,
                phone,
                email: email || null,
                interest: String(req.body?.interest || "").trim() || null,
                source: "MANUAL"
            });
        } catch {
            return res.redirect("/admin/leads?error=create");
        }

        return res.redirect("/admin/leads?success=created");
    }

    static async updateStatus(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");
        const status = String(req.body?.status || "") as LeadStatus;

        if (!(STATUSES as readonly string[]).includes(status)) {
            return res.redirect("/admin/leads?error=status");
        }

        await LeadService.updateStatus(req.user!.workspaceId, id, status);

        return res.redirect("/admin/leads?success=status");
    }

    static async retry(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            await LeadService.retry(req.user!.workspaceId, id);

            return res.redirect("/admin/leads?success=retry");
        } catch {
            return res.redirect("/admin/leads?error=retry");
        }
    }

    static async exportCsv(req: Request, res: Response) {
        const csv = await LeadService.exportCsv(req.user!.workspaceId);

        res.setHeader("content-type", "text/csv; charset=utf-8");
        res.setHeader("content-disposition", "attachment; filename=leads.csv");

        return res.send(csv);
    }
}