import http from "node:http";

import app from "./app";
import { appConfig } from "./config/app.config";
import { logger } from "./config/logger";
import { registerProcessGuards } from "./config/process-guards";
import { startBackgroundJobs } from "./jobs";
import { backfillUserEmails } from "./jobs/email-hash.job";
import { initSocket } from "./sockets";

const server = http.createServer(app);

registerProcessGuards();

initSocket(server);

/**
 * Antes de escuchar peticiones se cifra el correo de los usuarios que
 * existían antes del cifrado en reposo y se calcula su índice ciego. Son
 * milisegundos y solo afecta a las filas que la migración marcó: sin esto,
 * quien ya tenía cuenta no podría entrar por unos segundos después del
 * despliegue.
 */
async function bootstrap() {
    try {
        await backfillUserEmails();
    } catch (error) {
        logger.error(
            { error: error instanceof Error ? error.message : error },
            "No se pudo cifrar el correo de los usuarios anteriores al cifrado. " +
                "Si la base todavía no tiene las migraciones aplicadas, se resolverá en el siguiente arranque."
        );
    }

    void startBackgroundJobs();

    server.listen(appConfig.port, () => {
        logger.info({
            app: appConfig.name,
            port: appConfig.port,
            env: appConfig.env,
            timezone: appConfig.timezone
        }, "Servidor iniciado correctamente");
    });
}

void bootstrap();
