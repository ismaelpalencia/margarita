import { Request, Response } from "express";

import { appConfig } from "../config/app.config";
import { SetupService } from "../services/setup.service";
import { setupSchema } from "../validations/setup.validation";

/**
 * Asistente de alta de una instalación nueva.
 *
 * Solo funciona mientras no exista un workspace: en cuanto la instalación
 * está configurada, la ruta deja de estar disponible. Es el mismo criterio
 * de un instalador: se cierra solo.
 */
export class SetupController {
    static async show(req: Request, res: Response) {
        if (await SetupService.isConfigured()) {
            return res.redirect("/auth/login");
        }

        return res.render("pages/setup/index", {
            appName: appConfig.name,
            values: {
                workspaceName: appConfig.name,
                workspaceSlug: "",
                adminName: "",
                adminEmail: ""
            },
            error: null
        });
    }

    static async submit(req: Request, res: Response) {
        if (await SetupService.isConfigured()) {
            return res.redirect("/auth/login");
        }

        const parsed = setupSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).render("pages/setup/index", {
                appName: appConfig.name,
                values: {
                    workspaceName: req.body?.workspaceName || "",
                    workspaceSlug: req.body?.workspaceSlug || "",
                    adminName: req.body?.adminName || "",
                    adminEmail: req.body?.adminEmail || ""
                },
                error: parsed.error.issues[0]?.message || "Datos inválidos."
            });
        }

        try {
            const result = await SetupService.createWorkspace(parsed.data);

            return res.redirect(
                `/auth/login?success=setup&email=${encodeURIComponent(result.adminEmail)}`
            );
        } catch (error) {
            return res.status(400).render("pages/setup/index", {
                appName: appConfig.name,
                values: {
                    workspaceName: parsed.data.workspaceName,
                    workspaceSlug: parsed.data.workspaceSlug,
                    adminName: parsed.data.adminName,
                    adminEmail: parsed.data.adminEmail
                },
                error:
                    error instanceof Error
                        ? error.message
                        : "No se pudo crear la instalación."
            });
        }
    }
}
