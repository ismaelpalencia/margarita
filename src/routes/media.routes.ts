import { Router } from "express";
import rateLimit from "express-rate-limit";

import { MediaController } from "../controllers/media.controller";

const router = Router();

/**
 * Una conversación con muchas fotos genera varias peticiones, así que
 * este endpoint tiene su propio límite en lugar de compartir el general
 * del panel (que es mucho más bajo).
 */
const mediaLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 600,
    standardHeaders: false,
    legacyHeaders: false
});

router.use(mediaLimiter);

router.get("/:id", MediaController.show);

export default router;
