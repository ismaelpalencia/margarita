import { Router } from "express";

import { HealthService } from "../services/health.service";

const router = Router();

router.get("/", async (_req, res) => {
    const status = await HealthService.getStatus();

    return res.status(status.httpStatus).json(status);
});

export default router;
