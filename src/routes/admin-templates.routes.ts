import { Router } from "express";

import { AdminTemplatesController } from "../controllers/admin-templates.controller";

const router = Router();

router.get("/", AdminTemplatesController.index);
router.get("/quality", AdminTemplatesController.quality);
router.post("/sync", AdminTemplatesController.sync);
router.post("/", AdminTemplatesController.create);
router.post("/:id/delete", AdminTemplatesController.remove);

export default router;
