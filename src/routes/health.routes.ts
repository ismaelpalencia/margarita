import { Router } from "express";

import { appConfig } from "../config/app.config";
import { HealthService } from "../services/health.service";

const router = Router();

router.get("/", async (req, res) => {
    try {
        const status = await HealthService.getStatus();

        /**
         * El healthcheck de Railway entra sin token y solo necesita saber si el
         * servicio está vivo. El detalle (commit, rutas, colas, admins) se
         * entrega con `?token=` o en desarrollo.
         */
        const conDetalle = appConfig.healthToken
            ? req.query.token === appConfig.healthToken
            : appConfig.env !== "production";

        if (!conDetalle) {
            return res.status(status.httpStatus).json({
                ok: status.ok,
                status: status.status,
                timestamp: status.timestamp
            });
        }

        return res.status(status.httpStatus).json(status);
    } catch (error) {
        /**
         * El healthcheck nunca debe tumbar el proceso ni quedarse
         * colgado: si algo falla, se reporta como no saludable.
         */
        return res.status(503).json({
            ok: false,
            app: "Margarita",
            status: "unhealthy",
            error:
                error instanceof Error
                    ? error.message
                    : "Error desconocido en el healthcheck",
            timestamp: new Date().toISOString()
        });
    }
});

export default router;
