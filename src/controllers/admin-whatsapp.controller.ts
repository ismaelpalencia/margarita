import { Request, Response } from "express";

import { appConfig } from "../config/app.config";
import { WhatsAppAccountService } from "../services/whatsapp-account.service";
import { WhatsAppNumberService } from "../services/whatsapp-number.service";
import { getRequiredParam } from "../utils/request";
import { updateWhatsAppCredentialsSchema } from "../validations/whatsapp-account.validation";
import { createWhatsAppAccountSchema } from "../validations/whatsapp-account.validation";
import {
    createNumberSchema,
    updateNumberSchema
} from "../validations/whatsapp-number.validation";

export class AdminWhatsAppController {
    static async show(req: Request, res: Response) {
        const webhookUrl = `${appConfig.appUrl}/webhooks/meta/whatsapp`;

        try {
            const [account, numbers] = await Promise.all([
                WhatsAppAccountService.getAccount(req.user!.workspaceId),
                WhatsAppNumberService.listNumbers(req.user!.workspaceId)
            ]);

            return res.render("pages/admin/whatsapp/show", {
                user: req.user,
                account,
                numbers,
                webhookUrl,
                success: req.query.success || null,
                error: req.query.error || null
            });
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "No se pudo cargar la cuenta de WhatsApp.";

            return res.render("pages/admin/whatsapp/show", {
                user: req.user,
                account: null,
                numbers: [],
                webhookUrl,
                success: null,
                error: message
            });
        }
    }

    static async createAccount(req: Request, res: Response) {
        const parsed = createWhatsAppAccountSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect("/admin/whatsapp?error=validation");
        }

        try {
            await WhatsAppAccountService.createAccount(req.user!.workspaceId, {
                businessAccountId: parsed.data.businessAccountId,
                apiVersion: parsed.data.apiVersion,
                accessToken: parsed.data.accessToken,
                verifyToken: parsed.data.verifyToken
            });

            return res.redirect("/admin/whatsapp?success=account_created");
        } catch {
            return res.redirect("/admin/whatsapp?error=account_create");
        }
    }

    static async updateCredentials(req: Request, res: Response) {
        const parsed = updateWhatsAppCredentialsSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect("/admin/whatsapp?error=validation");
        }

        try {
            await WhatsAppAccountService.updateCredentials(
                req.user!.workspaceId,
                parsed.data
            );

            return res.redirect("/admin/whatsapp?success=updated");
        } catch {
            return res.redirect("/admin/whatsapp?error=update");
        }
    }

    static async createNumber(req: Request, res: Response) {
        const parsed = createNumberSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect("/admin/whatsapp?error=number_validation");
        }

        try {
            await WhatsAppNumberService.createNumber(req.user!.workspaceId, {
                displayName: parsed.data.displayName,
                phoneNumber: parsed.data.phoneNumber,
                phoneNumberId: parsed.data.phoneNumberId
            });

            return res.redirect("/admin/whatsapp?success=number_created");
        } catch {
            return res.redirect("/admin/whatsapp?error=number_create");
        }
    }

    static async updateNumber(req: Request, res: Response) {
        const numberId = getRequiredParam(req, "numberId");
        const parsed = updateNumberSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect("/admin/whatsapp?error=number_validation");
        }

        try {
            await WhatsAppNumberService.updateNumber(
                req.user!.workspaceId,
                numberId,
                parsed.data
            );

            return res.redirect("/admin/whatsapp?success=number_updated");
        } catch {
            return res.redirect("/admin/whatsapp?error=number_update");
        }
    }

    static async toggleNumber(req: Request, res: Response) {
        const numberId = getRequiredParam(req, "numberId");

        try {
            const number = await WhatsAppNumberService.getById(
                req.user!.workspaceId,
                numberId
            );

            if (!number) {
                return res.redirect("/admin/whatsapp?error=number_update");
            }

            await WhatsAppNumberService.setActive(
                req.user!.workspaceId,
                numberId,
                !number.isActive
            );

            return res.redirect("/admin/whatsapp?success=number_updated");
        } catch {
            return res.redirect("/admin/whatsapp?error=number_update");
        }
    }

    static async testConnection(req: Request, res: Response) {
        const numberId = getRequiredParam(req, "numberId");

        const result = await WhatsAppNumberService.testConnection(
            req.user!.workspaceId,
            numberId
        );

        if (result.ok) {
            return res.redirect("/admin/whatsapp?success=connection");
        }

        return res.redirect("/admin/whatsapp?error=connection");
    }

    static async encryptSecrets(req: Request, res: Response) {
        try {
            const result = await WhatsAppAccountService.encryptStoredCredentials(
                req.user!.workspaceId
            );

            return res.redirect(
                result.changed
                    ? "/admin/whatsapp?success=encrypted"
                    : "/admin/whatsapp?success=already_encrypted"
            );
        } catch {
            return res.redirect("/admin/whatsapp?error=encrypt");
        }
    }
}
