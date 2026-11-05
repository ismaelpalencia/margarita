import { Router } from "express";

import { AdminSystemController } from "../controllers/admin-system.controller";

const router = Router();

router.get("/", AdminSystemController.index);
/** Interruptor de giro: enciende o apaga el módulo de cobranza. */
router.post("/profile", AdminSystemController.updateProfile);
/** Interruptor de listas interactivas (independiente del giro). */
router.post("/interactive-lists", AdminSystemController.updateInteractiveLists);
/** Configuración de asignación y escalamiento de handoff. */
router.post("/handoff", AdminSystemController.saveHandoff);
/** Prueba de R2 desde el panel: sube, lee y borra un archivo diminuto. */
router.get("/r2", AdminSystemController.testR2);

export default router;
