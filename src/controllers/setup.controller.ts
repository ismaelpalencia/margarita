import { Request, Response } from "express";

import { appConfig } from "../config/app.config";
import { SetupService } from "../services/setup.service";
import {
    storageBlocksSetup,
    storageStatus
} from "../services/storage-status.service";
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

        /**
         * Sin un Volume, la primera actualización borra los archivos de las
         * conversaciones. El alta se detiene aquí, antes de crear la empresa,
         * para que nadie active un cliente que va a perder datos.
         */
        if (storageBlocksSetup()) {
            return res.status(409).render("pages/setup/index", {
                appName: appConfig.name,
                values: {
                    workspaceName:
                        typeof req.body?.workspaceName === "string"
                            ? req.body.workspaceName
                            : appConfig.name,
                    workspaceSlug:
                        typeof req.body?.workspaceSlug === "string"
                            ? req.body.workspaceSlug
                            : "",
                    adminName:
                        typeof req.body?.adminName === "string"
                            ? req.body.adminName
                            : "",
                    adminEmail:
                        typeof req.body?.adminEmail === "string"
                            ? req.body.adminEmail
                            : ""
                },
                error:
                    "Antes de activar la instalación, monta un Volume y apunta MEDIA_STORAGE_DIR a esa carpeta. " +
                    `Hoy los archivos se guardan en ${storageStatus().dir}, que se borra en cada despliegue.`
            });
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
