import { LeadStatus } from "@prisma/client";
import { Request, Response } from "express";

import { prisma } from "../config/prisma";
import { LeadService } from "../services/lead.service";
import { getRequiredParam } from "../utils/request";
import { LEAD_CSV_COLUMNS, LeadCsvColumn } from "../utils/lead-csv";

const STATUSES = [LeadStatus.NUEVO, LeadStatus.CONTACTADO, LeadStatus.CONVERTIDO, LeadStatus.DESCARTADO] as const;

export class AdminLeadsController {
    static async index(req: Request, res: Response) {
        const status = typeof req.query.status === "string" ? req.query.status : "ALL";
        const [leads, flags, contacts] = await Promise.all([
            LeadService.list(req.user!.workspaceId, status),
            prisma.workspace.findUniqueOrThrow({
                where: { id: req.user!.workspaceId },
                select: {
                    leadsEnabled: true,
                    leadWebhookUrl: true,
                    leadWebhookSecret: true,
                    leadSheetsWebhookUrl: true,
                    leadSheetsWebhookSecret: true
                }
            }),
            prisma.contact.findMany({
                where: {
                    workspaceId: req.user!.workspaceId,
                    isActive: true,
                    conversations: { some: {} }
                },
                select: {
                    id: true,
                    profileName: true,
                    customName: true,
                    phone: true,
                    conversations: {
                        select: { id: true },
                        orderBy: { lastMessageAt: "desc" },
                        take: 1
                    }
                },
                orderBy: { updatedAt: "desc" },
                take: 200
            })
        ]);

        const leadContactIds = new Set(
            leads.map((lead) => lead.contactId).filter(Boolean)
        );

        return res.render("pages/admin/leads/index", {
            user: req.user,
            leads,
            statuses: STATUSES,
            currentStatus: status,
            leadsEnabled: flags.leadsEnabled,
            leadWebhookUrl: flags.leadWebhookUrl ?? "",
            hasWebhookSecret: Boolean(flags.leadWebhookSecret),
            leadSheetsWebhookUrl: flags.leadSheetsWebhookUrl ?? "",
            hasSheetsSecret: Boolean(flags.leadSheetsWebhookSecret),
            contacts,
            leadContactIds,
            csvColumns: LEAD_CSV_COLUMNS,
            success: req.query.success || null,
            error: req.query.error || null
        });
    }

    static async saveSettings(req: Request, res: Response) {
        const leadsEnabled = req.body?.leadsEnabled === "true";
        const leadWebhookUrl = String(req.body?.leadWebhookUrl || "").trim();
        const leadWebhookSecret = String(req.body?.leadWebhookSecret || "").trim();
        const leadSheetsWebhookUrl = String(
            req.body?.leadSheetsWebhookUrl || ""
        ).trim();
        const leadSheetsWebhookSecret = String(
            req.body?.leadSheetsWebhookSecret || ""
        ).trim();

        try {
            await prisma.workspace.update({
                where: { id: req.user!.workspaceId },
                data: {
                    leadsEnabled,
                    leadWebhookUrl: leadWebhookUrl || null,
                    leadSheetsWebhookUrl: leadSheetsWebhookUrl || null,
                    ...(leadWebhookSecret
                        ? { leadWebhookSecret }
                        : {}),
                    ...(leadSheetsWebhookSecret
                        ? { leadSheetsWebhookSecret }
                        : {})
                }
            });
        } catch {
            return res.redirect("/admin/leads?error=settings");
        }

        return res.redirect("/admin/leads?success=settings");
    }

    static async create(req: Request, res: Response) {
        const contactId = String(req.body?.contactId || "").trim();
        const email = String(req.body?.email || "").trim();
        let name = String(req.body?.name || "").trim();
        let phone = String(req.body?.phone || "").trim();
        let conversationId: string | null = null;

        if (contactId) {
            const contact = await prisma.contact.findFirst({
                where: { id: contactId, workspaceId: req.user!.workspaceId },
                select: {
                    id: true,
                    profileName: true,
                    customName: true,
                    phone: true,
                    conversations: {
                        select: { id: true },
                        orderBy: { lastMessageAt: "desc" },
                        take: 1
                    }
                }
            });

            if (!contact) {
                return res.redirect("/admin/leads?error=contact");
            }

            const existing = await prisma.lead.findFirst({
                where: {
                    workspaceId: req.user!.workspaceId,
                    contactId: contact.id
                },
                select: { id: true }
            });

            if (existing) {
                return res.redirect("/admin/leads?error=lead_exists");
            }

            name =
                contact.customName ||
                contact.profileName ||
                contact.phone ||
                name;
            phone = contact.phone || phone;
            conversationId = contact.conversations[0]?.id ?? null;
        }

        if (!name || !phone) {
            return res.redirect("/admin/leads?error=name_phone");
        }

        try {
            await LeadService.capture({
                workspaceId: req.user!.workspaceId,
                contactId: contactId || null,
                conversationId,
                name,
                phone,
                email: email || null,
                interest: String(req.body?.interest || "").trim() || null,
                source: contactId ? "MANUAL_CONTACT" : "MANUAL"
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

    static async remove(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            await LeadService.delete(req.user!.workspaceId, id);
            return res.redirect("/admin/leads?success=deleted");
        } catch {
            return res.redirect("/admin/leads?error=delete");
        }
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
        const rawColumns = Array.isArray(req.query.columns)
            ? req.query.columns.join(",")
            : String(req.query.columns || "");
        const columns = rawColumns
            .split(",")
            .map((column) => column.trim())
            .filter((column): column is LeadCsvColumn =>
                (LEAD_CSV_COLUMNS as readonly string[]).includes(column)
            );

        const csv = await LeadService.exportCsv(req.user!.workspaceId, {
            columns: columns.length > 0 ? columns : undefined,
            includeFields: req.query.fields === "1"
        });

        res.setHeader("content-type", "text/csv; charset=utf-8");
        res.setHeader("content-disposition", "attachment; filename=leads.csv");

        return res.send(csv);
    }
}