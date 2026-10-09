import { Router } from "express";

import { AdminRoadmapController } from "../controllers/admin-roadmap.controller";

const router = Router();

router.get("/", AdminRoadmapController.index);

export default router;