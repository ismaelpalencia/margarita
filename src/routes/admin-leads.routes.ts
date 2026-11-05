import { Router } from "express";

import { AdminLeadsController } from "../controllers/admin-leads.controller";

const router = Router();

router.get("/", AdminLeadsController.index);
router.get("/export", AdminLeadsController.exportCsv);
router.post("/settings", AdminLeadsController.saveSettings);
router.post("/", AdminLeadsController.create);
router.post("/:id/status", AdminLeadsController.updateStatus);
router.post("/:id/retry", AdminLeadsController.retry);

export default router;