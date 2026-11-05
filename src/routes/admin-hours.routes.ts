import { Router } from "express";

import { AdminHoursController } from "../controllers/admin-hours.controller";

const router = Router();

router.get("/", AdminHoursController.index);
router.post("/", AdminHoursController.save);

export default router;
