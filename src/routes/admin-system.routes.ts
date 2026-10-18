import { Router } from "express";

import { AdminSystemController } from "../controllers/admin-system.controller";

const router = Router();

router.get("/", AdminSystemController.index);
/** Prueba de R2 desde el panel: sube, lee y borra un archivo diminuto. */
router.get("/r2", AdminSystemController.testR2);

export default router;
