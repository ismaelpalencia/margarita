import { Router } from "express";

import { AdminBackupController } from "../controllers/admin-backup.controller";

const router = Router();

router.get("/", AdminBackupController.index);
router.get("/download", AdminBackupController.download);
router.post("/snapshot", AdminBackupController.createSnapshot);
router.get("/snapshot/:file", AdminBackupController.downloadSnapshot);
router.post("/snapshot/:file/verify", AdminBackupController.verifySnapshot);
router.post("/purge", AdminBackupController.purge);

export default router;
