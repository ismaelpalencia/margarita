import { Router } from "express";

import { DemoController } from "../controllers/demo.controller";

const router = Router();

router.get("/demo", DemoController.show);
router.post("/api/demo/session", DemoController.session);
router.post("/api/demo/chat", DemoController.chat);

export default router;