import { Request, Response } from "express";
import { LogLevel, LogModule } from "@prisma/client";

import { LogService } from "../services/log.service";
import {
    BACKUP_ENTITIES,
    BackupService,
    isBackupEntity,
    MAX_ROWS
} from "../services/backup.service";
import { WorkspaceService } from "../services/workspace.service";

function stamp(): string {
    return new Date().toISOString().slice(0, 10);
}

export class AdminBackupController {
    static async index(req: Request, res: Response) {
        const summary = await WorkspaceService.getDataSummary(
            req.user!.workspaceId
        );

        return res.render("pages/admin/backup/index", {
            user: req.user,
            entities: BACKUP_ENTITIES,
            maxRows: MAX_ROWS,
            summary,
            error: req.query.error || null,
            success: req.query.success || null
        });
    }

    /**
     * Borra todos los datos de la instalación. Es la salida de un
     * contrato: deja el sistema como recién instalado.
     */
    static async purge(req: Request, res: Response) {
        const confirmation =
            typeof req.body?.confirm === "string" ? req.body.confirm : "";

        try {
            await WorkspaceService.purgeWorkspace(
                req.user!.workspaceId,
                confirmation
            );

            /**
             * La sesión acaba de dejar de existir con el usuario, así que se
             * manda al asistente de alta: la instalación quedó vacía.
             */
            return res.redirect("/setup");
        } catch {
            return res.redirect("/admin/backup?error=purge");
        }
    }

    static async download(req: Request, res: Response) {
        const format = req.query.format === "csv" ? "csv" : "json";

        try {
            if (format === "json") {
                const data = await BackupService.collect(req.user!.workspaceId);
                const filename = `margarita-backup-${stamp()}.json`;

                await LogService.create({
                    workspaceId: req.user!.workspaceId,
                    level: LogLevel.WARN,
                    module: LogModule.SYSTEM,
                    action: "BACKUP_DOWNLOADED",
                    message: "Se descargó una copia de seguridad de los datos.",
                    payload: {
                        format: "json",
                        userId: req.user!.id
                    }
                });

                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.setHeader(
                    "Content-Disposition",
                    `attachment; filename="${filename}"`
                );

                return res.send(JSON.stringify(data, null, 2));
            }

            const entity =
                typeof req.query.entity === "string" ? req.query.entity : "messages";

            if (!isBackupEntity(entity)) {
                return res.redirect("/admin/backup?error=entity");
            }

            const { filename, content } = await BackupService.toCsv(
                req.user!.workspaceId,
                entity
            );

            await LogService.create({
                workspaceId: req.user!.workspaceId,
                level: LogLevel.WARN,
                module: LogModule.SYSTEM,
                action: "BACKUP_DOWNLOADED",
                message: `Se descargó la exportación de ${entity}.`,
                payload: {
                    format: "csv",
                    entity,
                    userId: req.user!.id
                }
            });

            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${filename}"`
            );

            return res.send(content);
        } catch (error) {
            console.error("Error generando el respaldo:", error);

            return res.redirect("/admin/backup?error=download");
        }
    }
}
