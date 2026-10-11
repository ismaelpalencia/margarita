import path from "node:path";

import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Request } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { appConfig } from "./config/app.config";
import { logger } from "./config/logger";
import { csrfProtection } from "./middlewares/csrf.middleware";
import indexRoutes from "./routes/index.routes";
import healthRoutes from "./routes/health.routes";


const app = express();

app.set("trust proxy", 1);

const rootDir = process.cwd();

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

app.use(
    cors({
        origin: appConfig.appUrl,
        credentials: true
    })
);

app.use(compression());

app.use(cookieParser());

/**
 * Guardamos el cuerpo crudo de las peticiones JSON para poder validar
 * la firma X-Hub-Signature-256 de los webhooks de Meta.
 */
app.use(
    express.json({
        limit: "2mb",
        verify: (req, _res, buf) => {
            (req as Request).rawBody = buf.toString("utf8");
        }
    })
);

app.use(express.urlencoded({ extended: true }));

app.use(csrfProtection);

app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 300,
        standardHeaders: true,
        legacyHeaders: false,
        /**
         * Meta entrega los webhooks en ráfagas. Si los limitamos por IP
         * terminamos respondiendo 429 y Meta reintenta o pierde eventos.
         * Los webhooks tienen su propio límite en webhook.routes.ts.
         */
        skip: (req) =>
            req.originalUrl.startsWith("/webhooks") ||
            req.originalUrl.startsWith("/health") ||
            req.originalUrl.startsWith("/media")
    })
);

app.use(express.static(path.join(rootDir, "src", "public")));

app.set("view engine", "ejs");

app.set("views", path.join(rootDir, "src", "views"));

app.use("/health", healthRoutes);

app.use("/", indexRoutes);

/**
 * Manejador final de errores. Evita que se filtre un stack trace al
 * navegador y deja el incidente en los logs del servidor.
 */
app.use(
    (
        error: Error,
        _req: Request,
        res: express.Response,
        _next: express.NextFunction
    ) => {
        logger.error({ err: error }, "Error no controlado en una petición");

        if (res.headersSent) {
            return;
        }

        res.status(500).type("html").send(
            "<h1>500</h1><p>Ocurrió un error inesperado. Intenta de nuevo.</p>"
        );
    }
);

export default app;
