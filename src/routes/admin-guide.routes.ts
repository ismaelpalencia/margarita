import { Router } from "express";

import { AdminGuideController } from "../controllers/admin-guide.controller";

const router = Router();

router.get("/", AdminGuideController.index);

export default router;
