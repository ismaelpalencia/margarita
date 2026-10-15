import { Router } from "express";

import { AdminReportsController } from "../controllers/admin-reports.controller";

const router = Router();

router.get("/", AdminReportsController.index);
router.get("/export", AdminReportsController.export);
router.post("/mark-no-answer", AdminReportsController.markNoAnswer);

export default router;
