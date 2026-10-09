import { Request, Response } from "express";

import { appConfig } from "../config/app.config";
import { WhatsAppAccountService } from "../services/whatsapp-account.service";
import { updateWhatsAppCredentialsSchema } from "../validations/whatsapp-account.validation";

export class AdminWhatsAppController {
    static async show(req: Request, res: Response) {
        try {
            const account = await WhatsAppAccountService.getAccount(
                req.user!.workspaceId
            );

            return res.render("pages/admin/whatsapp/show", {
                user: req.user,
                account,
                webhookUrl: `${appConfig.appUrl}/webhooks/meta/whatsapp`,
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
                webhookUrl: `${appConfig.appUrl}/webhooks/meta/whatsapp`,
                success: null,
                error: message
            });
        }
    }

    static async testConnection(req: Request, res: Response) {
        const result = await WhatsAppAccountService.testConnection(
            req.user!.workspaceId
        );

        if (result.ok) {
            return res.redirect("/admin/whatsapp?success=connection");
        }

        return res.redirect("/admin/whatsapp?error=connection");
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
