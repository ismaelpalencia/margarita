import { Router } from "express";

import { AdminTemplatesController } from "../controllers/admin-templates.controller";

const router = Router();

router.get("/", AdminTemplatesController.index);
router.post("/sync", AdminTemplatesController.sync);

export default router;
