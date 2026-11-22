import { Request, Response } from "express";
import { LogLevel, LogModule } from "@prisma/client";

import { CampaignService } from "../services/campaign.service";
import { LogService } from "../services/log.service";
import { getRequiredParam } from "../utils/request";
import { readRecipientTemplateValues } from "../utils/campaign-variables";

import fs from "fs";
import { ExcelCampaignService } from "../services/excel-campaign.service";
import { prisma } from "../config/prisma";
import { campaignExampleCsv } from "../utils/campaign-example";
import { templateVariableShape } from "../utils/template";
import {
    createCampaignFromExcelSchema,
    createCampaignSchema
} from "../validations/campaign.validation";





export class AdminCampaignsController {
    /**
     * Las campañas se envían desde el número activo de la sesión.
     */
    private static requireActiveNumber(req: Request): string {
        if (!req.activeNumber) {
            throw new Error(
                "No hay un número de WhatsApp activo. Configúralo en Admin → WhatsApp."
            );
        }

        return req.activeNumber.id;
    }

    private static describeFailure(error: unknown): string {
        return error instanceof Error ? error.message : "Error desconocido";
    }

    /**
     * Traduce el motivo a un código corto para la URL. El detalle
     * completo queda en la bitácora, porque un redirect no puede
     * cargar con un mensaje largo.
     */
    private static failureCode(error: unknown): string {
        const message = AdminCampaignsController.describeFailure(error);

        if (/marketing/i.test(message)) return "marketing";
        if (/columna/i.test(message)) return "column";
        if (/variable|encabezado|botón de enlace/i.test(message)) return "variables";
        if (/contacto/i.test(message)) return "contacts";
        if (/destinatario/i.test(message)) return "recipients";

        return "create";
    }

    private static async logFailure(
        req: Request,
        error: unknown,
        action: string
    ) {
        try {
            await LogService.create({
                workspaceId: req.user!.workspaceId,
                level: LogLevel.WARN,
                module: LogModule.CAMPAIGN,
                action,
                message: AdminCampaignsController.describeFailure(error),
                payload: {
                    route: req.originalUrl,
                    userId: req.user!.id
                }
            });
        } catch {
            /* La bitácora no debe tumbar la petición. */
        }
    }

    static async index(req: Request, res: Response) {
        if (!(req.accepts("json") && !req.accepts("html"))) {
            return res.redirect("/panel/admin/campaigns");
        }
        const campaigns = await CampaignService.listCampaigns(
            req.user!.workspaceId,
            req.activeNumber?.id
        );

        return res.json({
            campaigns: campaigns.map((campaign) => ({
                id: campaign.id,
                name: campaign.name,
                status: campaign.status,
                createdAt: campaign.createdAt,
                template: { name: campaign.template.name, language: campaign.template.language },
                recipientsCount: campaign._count.recipients
            })),
            success: req.query.success === "created",
            error: Boolean(req.query.error)
        });
    }

    static async create(req: Request, res: Response) {
        const data = await CampaignService.getCreateData(
            req.user!.workspaceId
        );

        if (req.accepts("json") && !req.accepts("html")) return res.json({ templates: data.templates.map(({ id, name, language, variableCount, headerVariableCount, urlVariableCount }) => ({ id, name, language, variableCount, headerVariableCount, urlVariableCount })), contacts: data.contacts.map(({ id, phone, customName, profileName, optOutAt }) => ({ id, phone, customName, profileName, optedOut: Boolean(optOutAt) })) });

        const query = req.originalUrl.includes("?")
            ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
            : "";
        return res.redirect(`/panel/admin/campaigns/create${query}`);
    }

    /**
     * Ejemplo de Excel para la plantilla elegida.
     *
     * Devuelve un CSV con los encabezados exactos —`phone`, `name` y una columna
     * por variable— y una fila de ejemplo. Se genera al momento porque la forma
     * depende de la plantilla: cuántas variables de cuerpo, si lleva encabezado
     * y si el botón de enlace tiene una.
     */
    static async example(req: Request, res: Response) {
        const templateId =
            typeof req.query.templateId === "string" ? req.query.templateId : "";

        if (!templateId) {
            return res.redirect("/panel/admin/campaigns/create?error=validation");
        }

        const template = await prisma.template.findFirst({
            where: {
                id: templateId,
                workspaceId: req.user!.workspaceId
            },
            select: { name: true, components: true }
        });

        if (!template) {
            return res.redirect("/panel/admin/campaigns/create?error=validation");
        }

        const shape = templateVariableShape(template.components);
        const csv = campaignExampleCsv({
            header: shape.header > 0,
            body: shape.body,
            url: shape.url > 0
        });
        const safeName = template.name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "plantilla";

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="ejemplo-${safeName}.csv"`
        );
        /** BOM para que Excel abra los acentos bien. */
        res.send("\uFEFF" + csv + "\n");
    }

    static async store(req: Request, res: Response) {
        const parsed = createCampaignSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect("/panel/admin/campaigns/create?error=validation");
        }

        try {
            const campaign = await CampaignService.createCampaign(
                req.user!.workspaceId,
                req.user!.id,
                parsed.data,
                AdminCampaignsController.requireActiveNumber(req)
            );

            return res.redirect(
                `/panel/admin/campaigns/${campaign.id}?success=created`
            );
        } catch (error) {
            await AdminCampaignsController.logFailure(
                req,
                error,
                "CAMPAIGN_CREATE_FAILED"
            );

            return res.redirect(
                `/panel/admin/campaigns/create?error=${AdminCampaignsController.failureCode(error)}`
            );
        }
    }

    static async show(req: Request, res: Response) {
        const campaignId = getRequiredParam(req, "id");

        const campaign = await CampaignService.getCampaign(
            req.user!.workspaceId,
            campaignId
        );

        if (!campaign) {
            return res.redirect("/panel/admin/campaigns?error=not_found");
        }

        if (req.accepts("json") && !req.accepts("html")) return res.json({ campaign: { id: campaign.id, name: campaign.name, status: campaign.status, createdAt: campaign.createdAt, scheduledFor: campaign.scheduledFor, totalRecipients: campaign.totalRecipients, template: { name: campaign.template.name, language: campaign.template.language }, whatsappNumber: campaign.whatsappNumber ? { displayName: campaign.whatsappNumber.displayName, phoneNumber: campaign.whatsappNumber.phoneNumber } : null, recipients: campaign.recipients.map((recipient) => { const values = readRecipientTemplateValues(recipient.variables); return { id: recipient.id, phone: recipient.phone, name: recipient.contact?.customName || recipient.contact?.profileName || recipient.phone, status: recipient.status, errorMessage: recipient.errorMessage, hasMessage: Boolean(recipient.message), variables: [values.header ? `Encabezado: ${values.header}` : null, ...values.body, values.button ? `Botón: ${values.button}` : null].filter(Boolean) }; }) }, success: req.query.success || null, error: req.query.error || null });

        return res.redirect(`/panel/admin/campaigns/${encodeURIComponent(campaign.id)}`);
    }

    static async retryFailed(req: Request, res: Response) {
        const campaignId = getRequiredParam(req, "id");

        try {
            await CampaignService.retryFailedRecipients(
                req.user!.workspaceId,
                campaignId
            );

            return res.redirect(
                `/panel/admin/campaigns/${campaignId}?success=retry_failed`
            );
        } catch (error) {
            await AdminCampaignsController.logFailure(
                req,
                error,
                "CAMPAIGN_RETRY_FAILED"
            );

            return res.redirect(
                `/panel/admin/campaigns/${campaignId}?error=retry_failed`
            );
        }
    }

    static async pause(req: Request, res: Response) {
        const campaignId = getRequiredParam(req, "id");

        try {
            await CampaignService.pauseCampaign(
                req.user!.workspaceId,
                campaignId
            );

            return res.redirect(`/panel/admin/campaigns/${campaignId}?success=paused`);
        } catch (error) {
            await AdminCampaignsController.logFailure(
                req,
                error,
                "CAMPAIGN_PAUSE_FAILED"
            );

            return res.redirect(`/panel/admin/campaigns/${campaignId}?error=pause`);
        }
    }

    static async resume(req: Request, res: Response) {
        const campaignId = getRequiredParam(req, "id");

        try {
            await CampaignService.startCampaign(
                req.user!.workspaceId,
                campaignId
            );

            return res.redirect(
                `/panel/admin/campaigns/${campaignId}?success=resumed`
            );
        } catch (error) {
            await AdminCampaignsController.logFailure(
                req,
                error,
                "CAMPAIGN_RESUME_FAILED"
            );

            return res.redirect(`/panel/admin/campaigns/${campaignId}?error=resume`);
        }
    }

    static async cancel(req: Request, res: Response) {
        const campaignId = getRequiredParam(req, "id");

        try {
            await CampaignService.cancelCampaign(
                req.user!.workspaceId,
                campaignId
            );

            return res.redirect(
                `/panel/admin/campaigns/${campaignId}?success=cancelled`
            );
        } catch (error) {
            await AdminCampaignsController.logFailure(
                req,
                error,
                "CAMPAIGN_CANCEL_FAILED"
            );

            return res.redirect(`/panel/admin/campaigns/${campaignId}?error=cancel`);
        }
    }

    static async send(req: Request, res: Response) {
        const campaignId = getRequiredParam(req, "id");

        try {
            await CampaignService.startCampaign(
                req.user!.workspaceId,
                campaignId
            );

            return res.redirect(
                `/panel/admin/campaigns/${campaignId}?success=sent`
            );
        } catch (error) {
            await AdminCampaignsController.logFailure(
                req,
                error,
                "CAMPAIGN_SEND_FAILED"
            );

            return res.redirect(
                `/panel/admin/campaigns/${campaignId}?error=send`
            );
        }
    }

    static async storeFromExcel(req: Request, res: Response) {
        const parsed = createCampaignFromExcelSchema.safeParse(req.body);

        if (!parsed.success || !req.file) {
            if (req.file?.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            return res.redirect("/panel/admin/campaigns/create?error=excel_validation");
        }

        try {
            const campaign = await ExcelCampaignService.createCampaignFromExcel({
                workspaceId: req.user!.workspaceId,
                createdById: req.user!.id,
                input: parsed.data,
                filePath: req.file.path,
                whatsappNumberId: AdminCampaignsController.requireActiveNumber(req)
            });

            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            return res.redirect(
                `/panel/admin/campaigns/${campaign.id}?success=created_excel`
            );
        } catch (error) {
            if (req.file?.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            await AdminCampaignsController.logFailure(
                req,
                error,
                "CAMPAIGN_CREATE_FAILED"
            );

            const code = AdminCampaignsController.failureCode(error);

            return res.redirect(
                `/panel/admin/campaigns/create?error=${code === "create" ? "excel_create" : code}`
            );
        }
    }

}
