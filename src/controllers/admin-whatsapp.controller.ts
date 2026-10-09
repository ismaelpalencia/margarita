import { Request, Response } from "express";

import { WhatsAppAccountService } from "../services/whatsapp-account.service";

export class AdminWhatsAppController {
    static async show(req: Request, res: Response) {
        try {
            const account = await WhatsAppAccountService.getAccount(
                req.user!.workspaceId
            );

            return res.render("pages/admin/whatsapp/show", {
                user: req.user,
                account,
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
}
