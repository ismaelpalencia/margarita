import { Router } from "express";

import { PushController } from "../controllers/push.controller";

const router = Router();

router.get("/public-key", PushController.publicKey);
router.post("/subscribe", PushController.subscribe);
router.post("/unsubscribe", PushController.unsubscribe);
router.post("/test", PushController.test);

export default router;
