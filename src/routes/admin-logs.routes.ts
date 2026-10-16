import { Router } from "express";

import { AdminLogsController } from "../controllers/admin-logs.controller";

const router = Router();

router.get("/", AdminLogsController.index);
/** Lo que Meta mandó, tal cual: para comprobar identificadores y reportar. */
router.get("/webhooks", AdminLogsController.webhooks);

export default router;
