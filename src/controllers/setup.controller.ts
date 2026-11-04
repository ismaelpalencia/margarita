import { Request, Response } from "express";

import { appConfig } from "../config/app.config";
import { SetupService } from "../services/setup.service";
import {
    storageBlocksSetup,
    storageStatus
} from "../services/storage-status.service";
import { setupSchema } from "../validations/setup.validation";
import {
    WORKSPACE_PROFILE_DESCRIPTIONS,
    WORKSPACE_PROFILE_LABELS,
    WORKSPACE_PROFILES
} from "../utils/workspace-profile";

type SetupValues = {
    workspaceName: string;
    workspaceSlug: string;
    adminName: string;
    adminEmail: string;
    profile: string;
};

/**
 * Datos que necesita el formulario en cualquier salida (alta, error de
 * validación o falta de Volume), para no repetir la lista de giros.
 */
function setupLocals(values: SetupValues, error: string | null) {
    return {
        appName: appConfig.name,
        values,
        error,
        profiles: WORKSPACE_PROFILES,
        profileLabels: WORKSPACE_PROFILE_LABELS,
        profileDescriptions: WORKSPACE_PROFILE_DESCRIPTIONS
    };
}

function valuesFromBody(req: Request): SetupValues {
    const text = (name: string, fallback = "") =>
        typeof req.body?.[name] === "string" ? req.body[name] : fallback;

    return {
        workspaceName: text("workspaceName"),
        workspaceSlug: text("workspaceSlug"),
        adminName: text("adminName"),
        adminEmail: text("adminEmail"),
        profile: text("profile", "GENERICO")
    };
}

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

        return res.render(
            "pages/setup/index",
            setupLocals(
                {
                    workspaceName: appConfig.name,
                    workspaceSlug: "",
                    adminName: "",
                    adminEmail: "",
                    profile: "GENERICO"
                },
                null
            )
        );
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
            const storage = storageStatus();

            return res
                .status(409)
                .render(
                    "pages/setup/index",
                    setupLocals(
                        valuesFromBody(req),
                        "Antes de activar la instalación, monta un Volume y apunta MEDIA_STORAGE_DIR a una carpeta dentro de él. " +
                            `${storage.message} `
                    )
                );
        }

        const parsed = setupSchema.safeParse(req.body);

        if (!parsed.success) {
            return res
                .status(400)
                .render(
                    "pages/setup/index",
                    setupLocals(
                        valuesFromBody(req),
                        parsed.error.issues[0]?.message || "Datos inválidos."
                    )
                );
        }

        try {
            const result = await SetupService.createWorkspace(parsed.data);

            return res.redirect(
                `/auth/login?success=setup&email=${encodeURIComponent(result.adminEmail)}`
            );
        } catch (error) {
            return res
                .status(400)
                .render(
                    "pages/setup/index",
                    setupLocals(
                        {
                            workspaceName: parsed.data.workspaceName,
                            workspaceSlug: parsed.data.workspaceSlug,
                            adminName: parsed.data.adminName,
                            adminEmail: parsed.data.adminEmail,
                            profile: parsed.data.profile
                        },
                        error instanceof Error
                            ? error.message
                            : "No se pudo crear la instalación."
                    )
                );
        }
    }
}
