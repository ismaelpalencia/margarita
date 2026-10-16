import { Router } from "express";

import { AdminReportsController } from "../controllers/admin-reports.controller";

const router = Router();

router.get("/", AdminReportsController.index);
router.get("/export", AdminReportsController.export);
router.post("/mark-no-answer", AdminReportsController.markNoAnswer);
/** El atajo de la lista de llamadas («llamé y no contestó»). */
router.post("/mark-call", AdminReportsController.markCallResult);

export default router;
