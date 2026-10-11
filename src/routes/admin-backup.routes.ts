import { Router } from "express";

import { AdminBackupController } from "../controllers/admin-backup.controller";

const router = Router();

router.get("/", AdminBackupController.index);
router.get("/download", AdminBackupController.download);

export default router;
