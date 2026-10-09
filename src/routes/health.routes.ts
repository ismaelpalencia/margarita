import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
    return res.status(200).json({
        ok: true,
        app: "Margarita",
        status: "healthy",
        timestamp: new Date().toISOString()
    });
});

export default router;