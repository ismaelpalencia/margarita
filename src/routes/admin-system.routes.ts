import { Router } from "express";

import { AdminSystemController } from "../controllers/admin-system.controller";

const router = Router();

router.get("/", AdminSystemController.index);

export default router;