import { logger } from "../config/logger";
import { appConfig } from "../config/app.config";
import { BackupFileService } from "../services/backup-file.service";

export const backupJobState = {
    enabled: appConfig.backupEnabled,
    intervalHours: appConfig.backupIntervalHours,
    lastRunAt: null as Date | null,
    lastSuccessAt: null as Date | null,
    lastError: null as string | null,
    running: false
};

/** Cada cuánto se revisa si toca respaldar. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Respaldo automático de la base.
 *
 * No usa un calendario fijo: revisa **si el último respaldo ya cumplió el
 * intervalo** (`BACKUP_INTERVAL_HOURS`, 24 h por defecto). Así, si el servicio
 * se reinicia o estuvo caído, el respaldo se retoma solo en la siguiente
 * vuelta en lugar de esperar a una hora exacta.
 *
 * Si falla, queda en la bitácora con nivel de error: con `ALERT_WEBHOOK_URL`
 * configurado, también avisa por fuera.
 */
export async function runBackupIfNeeded(reason: "AUTO" | "MANUAL" = "AUTO") {
    const status = await BackupFileService.status();

    if (reason === "AUTO" && !BackupFileService.needsBackup(status)) {
        return { skipped: true, status };
    }

    const { info, counts } = await BackupFileService.create(reason);
    const totalRows = Object.values(counts).reduce(
        (sum, value) => sum + value,
        0
    );

    backupJobState.lastSuccessAt = info.createdAt;

    logger.info(
        {
            file: info.file,
            size: info.sizeLabel,
            rows: totalRows
        },
        "Respaldo de la base creado y verificado"
    );

    return { skipped: false, status, info, counts };
}

export async function runBackupSafely(reason: "AUTO" | "MANUAL" = "AUTO") {
    try {
        return await runBackupIfNeeded(reason);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        backupJobState.lastError = message;

        logger.error(
            { error: message },
            "Falló el respaldo de la base. Revisa la carpeta de respaldos y los permisos."
        );

        /** Se registra como error para que dispare las alertas externas. */
        const { LogService } = await import("../services/log.service");
        const { LogLevel, LogModule } = await import("@prisma/client");

        await LogService.create({
            level: LogLevel.ERROR,
            module: LogModule.SYSTEM,
            action: "BACKUP_FAILED",
            message: "No se pudo crear el respaldo de la base.",
            payload: { error: message }
        }).catch(() => undefined);

        return { skipped: true, error: message };
    }
}

export function startBackupJob() {
    if (!appConfig.backupEnabled) {
        logger.warn(
            "Los respaldos automáticos están apagados (BACKUP_ENABLED=false)."
        );

        return backupJobState;
    }

    /**
     * Se espera un poco al arranque para no competir con las migraciones y
     * con el worker de webhooks.
     */
    setTimeout(() => {
        void runBackupSafely("AUTO");
    }, 2 * 60 * 1000);

    const timer = setInterval(() => {
        if (backupJobState.running) {
            return;
        }

        backupJobState.running = true;
        backupJobState.lastRunAt = new Date();

        void runBackupSafely("AUTO").finally(() => {
            backupJobState.running = false;
        });
    }, CHECK_INTERVAL_MS);

    /** No debe impedir que el proceso termine si alguien lo cierra. */
    timer.unref?.();

    return backupJobState;
}
