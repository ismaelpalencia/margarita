import { Router } from "express";

import { AdminLogsController } from "../controllers/admin-logs.controller";

const router = Router();

router.get("/", AdminLogsController.index);

export default router;