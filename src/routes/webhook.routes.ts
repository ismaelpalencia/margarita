import { Router } from "express";
import rateLimit from "express-rate-limit";

import { MetaWebhookController } from "../controllers/meta-webhook.controller";

const router = Router();

/**
 * El rate limit global excluye /webhooks porque Meta envía ráfagas.
 * Aquí ponemos un techo alto solo para frenar abuso, no tráfico legítimo.
 */
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1200,
    standardHeaders: false,
    legacyHeaders: false
});

router.use(webhookLimiter);

router.get("/meta/whatsapp", MetaWebhookController.verify);
router.post("/meta/whatsapp", MetaWebhookController.receive);

export default router;
