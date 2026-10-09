import { Router } from "express";

import { HealthService } from "../services/health.service";

const router = Router();

router.get("/", async (_req, res) => {
    try {
        const status = await HealthService.getStatus();

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
