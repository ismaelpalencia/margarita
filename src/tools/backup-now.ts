import "dotenv/config";

import { BackupFileService } from "../services/backup-file.service";
import { runBackupSafely } from "../jobs/backup.job";

/**
 * Crea un respaldo ahora mismo, sin esperar al job.
 *
 *   npm run db:backup
 *
 * Sirve para tomar una copia antes de una migración, de un borrado o de
 * cualquier cambio delicado.
 */
async function main() {
    const result = await runBackupSafely("MANUAL");

    if ("error" in result && result.error) {
        throw new Error(String(result.error));
    }

    if ("info" in result && result.info) {
        const rows = Object.values(result.counts ?? {}).reduce(
            (sum, value) => sum + value,
            0
        );

        console.log(
            `[respaldo] ${result.info.file} · ${result.info.sizeLabel} · ${rows} filas`
        );
        console.log(`[respaldo] Carpeta: ${BackupFileService.dir()}`);
    }

    await BackupFileService.disconnect();
}

main().catch((error) => {
    console.error(
        "[respaldo] Error:",
        error instanceof Error ? error.message : error
    );

    process.exit(1);
});
