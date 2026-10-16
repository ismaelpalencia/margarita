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
import {
    BackupFileService,
    SnapshotInfo
} from "../services/backup-file.service";
import { runBackupSafely } from "../jobs/backup.job";
import { humanSize } from "../utils/backup-format";
import { formatDateTimeMX } from "../utils/date";

function stamp(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Solo nombres de respaldo: nada de rutas que se salgan de la carpeta. */
const SNAPSHOT_NAME = /^margarita-\d{4}-\d{2}-\d{2}-\d{4}\.mgb$/;

export class AdminBackupController {
    static async index(req: Request, res: Response) {
        const [summary, status, snapshots] = await Promise.all([
            WorkspaceService.getDataSummary(req.user!.workspaceId),
            BackupFileService.status(),
            Promise.resolve(BackupFileService.list())
        ]);

        return res.render("pages/admin/backup/index", {
            user: req.user,
            entities: BACKUP_ENTITIES,
            maxRows: MAX_ROWS,
            summary,
            backup: status,
            snapshots,
            formatDateTimeMX,
            error: req.query.error || null,
            success: req.query.success || null,
            /** Filas leídas al verificar un respaldo (llega como local, no de `req`). */
            rows: Number(req.query.rows) || 0
        });
    }

    /** Respaldo a mano, sin esperar al job. */
    static async createSnapshot(req: Request, res: Response) {
        const result = await runBackupSafely("MANUAL");

        if ("error" in result && result.error) {
            return res.redirect("/admin/backup?error=snapshot");
        }

        await LogService.create({
            workspaceId: req.user!.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.SYSTEM,
            action: "BACKUP_REQUESTED",
            message: "Se creó un respaldo desde el panel.",
            payload: {
                by: req.user!.id,
                file: "info" in result ? result.info?.file : null
            }
        });

        return res.redirect("/admin/backup?success=snapshot");
    }

    /**
     * Descarga un respaldo. El archivo va cifrado: se puede guardar fuera del
     * servidor sin exponer teléfonos ni mensajes.
     */
    static async downloadSnapshot(req: Request, res: Response) {
        const file = AdminBackupController.snapshotFrom(req);

        if (!file) {
            return res.redirect("/admin/backup?error=snapshot-name");
        }

        return res.download(file.path, file.file);
    }

    /** Comprueba que el archivo se puede leer y descifrar. */
    static async verifySnapshot(req: Request, res: Response) {
        const file = AdminBackupController.snapshotFrom(req);

        if (!file) {
            return res.redirect("/admin/backup?error=snapshot-name");
        }

        try {
            const payload = BackupFileService.read(file.path);
            const rows = Object.values(payload.counts).reduce(
                (sum, value) => sum + value,
                0
            );

            await LogService.create({
                workspaceId: req.user!.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.SYSTEM,
                action: "BACKUP_VERIFIED",
                message: "Se verificó un respaldo desde el panel.",
                payload: { file: file.file, rows }
            });

            return res.redirect(
                `/admin/backup?success=verified&rows=${rows}`
            );
        } catch {
            return res.redirect("/admin/backup?error=snapshot-verify");
        }
    }

    private static snapshotFrom(req: Request): SnapshotInfo | null {
        const name =
            typeof req.params.file === "string" ? req.params.file : "";

        if (!SNAPSHOT_NAME.test(name)) {
            return null;
        }

        return BackupFileService.list().find((item) => item.file === name) ?? null;
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
