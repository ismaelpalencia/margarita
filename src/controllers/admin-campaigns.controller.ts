import { Request, Response } from "express";
import { LogLevel, LogModule } from "@prisma/client";

import { CampaignService } from "../services/campaign.service";
import { LogService } from "../services/log.service";
import { getRequiredParam } from "../utils/request";

import fs from "fs";
import { ExcelCampaignService } from "../services/excel-campaign.service";
import {
    createCampaignFromExcelSchema,
    createCampaignSchema
} from "../validations/campaign.validation";





export class AdminCampaignsController {
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

        if (/columna/i.test(message)) return "column";
        if (/variable/i.test(message)) return "variables";
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
        const campaigns = await CampaignService.listCampaigns(
            req.user!.workspaceId
        );

        return res.render("pages/admin/campaigns/index", {
            user: req.user,
            campaigns,
            success: req.query.success || null,
            error: req.query.error || null
        });
    }

    static async create(req: Request, res: Response) {
        const data = await CampaignService.getCreateData(
            req.user!.workspaceId
        );

        return res.render("pages/admin/campaigns/create", {
            user: req.user,
            templates: data.templates,
            contacts: data.contacts,
            error: req.query.error || null
        });
    }

    static async store(req: Request, res: Response) {
        const parsed = createCampaignSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect("/admin/campaigns/create?error=validation");
        }

        try {
            const campaign = await CampaignService.createCampaign(
                req.user!.workspaceId,
                req.user!.id,
                parsed.data
            );

            return res.redirect(
                `/admin/campaigns/${campaign.id}?success=created`
            );
        } catch (error) {
            await AdminCampaignsController.logFailure(
                req,
                error,
                "CAMPAIGN_CREATE_FAILED"
            );

            return res.redirect(
                `/admin/campaigns/create?error=${AdminCampaignsController.failureCode(error)}`
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
            return res.redirect("/admin/campaigns?error=not_found");
        }

        return res.render("pages/admin/campaigns/show", {
            user: req.user,
            campaign,
            success: req.query.success || null,
            error: req.query.error || null
        });
    }

    static async retryFailed(req: Request, res: Response) {
        const campaignId = getRequiredParam(req, "id");

        try {
            await CampaignService.retryFailedRecipients(
                req.user!.workspaceId,
                campaignId
            );

            return res.redirect(
                `/admin/campaigns/${campaignId}?success=retry_failed`
            );
        } catch (error) {
            await AdminCampaignsController.logFailure(
                req,
                error,
                "CAMPAIGN_RETRY_FAILED"
            );

            return res.redirect(
                `/admin/campaigns/${campaignId}?error=retry_failed`
            );
        }
    }

    static async send(req: Request, res: Response) {
        const campaignId = getRequiredParam(req, "id");

        try {
            await CampaignService.sendCampaign(
                req.user!.workspaceId,
                campaignId
            );

            return res.redirect(
                `/admin/campaigns/${campaignId}?success=sent`
            );
        } catch (error) {
            await AdminCampaignsController.logFailure(
                req,
                error,
                "CAMPAIGN_SEND_FAILED"
            );

            return res.redirect(
                `/admin/campaigns/${campaignId}?error=send`
            );
        }
    }

    static async storeFromExcel(req: Request, res: Response) {
        const parsed = createCampaignFromExcelSchema.safeParse(req.body);

        if (!parsed.success || !req.file) {
            if (req.file?.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            return res.redirect("/admin/campaigns/create?error=excel_validation");
        }

        try {
            const campaign = await ExcelCampaignService.createCampaignFromExcel({
                workspaceId: req.user!.workspaceId,
                createdById: req.user!.id,
                input: parsed.data,
                filePath: req.file.path
            });

            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            return res.redirect(
                `/admin/campaigns/${campaign.id}?success=created_excel`
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
                `/admin/campaigns/create?error=${code === "create" ? "excel_create" : code}`
            );
        }
    }

}
