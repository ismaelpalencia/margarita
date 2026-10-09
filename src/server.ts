import http from "node:http";

import app from "./app";
import { appConfig } from "./config/app.config";
import { logger } from "./config/logger";
import { startBackgroundJobs } from "./jobs";
import { initSocket } from "./sockets";

const server = http.createServer(app);

initSocket(server);

startBackgroundJobs();

server.listen(appConfig.port, () => {
    logger.info({
        app: appConfig.name,
        port: appConfig.port,
        env: appConfig.env,
        timezone: appConfig.timezone
    }, "Servidor iniciado correctamente");
});
