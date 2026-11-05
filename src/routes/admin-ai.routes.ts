import { Router } from "express";

import { AdminAiController } from "../controllers/admin-ai.controller";
import { AdminFlowController } from "../controllers/admin-flow.controller";

/**
 * Capa de IA (fase 1: sugerencias).
 *
 * Todo está bajo `/admin/ai` y detrás del rol de administrador: el agente
 * solo ve el borrador en la bandeja, no configura el modelo ni la base de
 * conocimiento.
 */
const router = Router();

router.get("/", AdminAiController.index);
router.post("/settings", AdminAiController.saveSettings);
router.post("/languages", AdminAiController.saveLanguages);

router.post("/knowledge", AdminAiController.createEntry);
router.get("/knowledge/:id", AdminAiController.showEditEntry);
router.post("/knowledge/:id", AdminAiController.updateEntry);
router.post("/knowledge/:id/active", AdminAiController.setEntryActive);

/** Consola de prueba: no guarda nada ni toca una conversación real. */
router.post("/test", AdminAiController.test);

/** Paquete inicial de flujos y base de conocimiento por vertical. */
router.get("/package", AdminFlowController.index);
router.post("/package/load", AdminFlowController.load);

/** Edición y activación de flujos (bienvenida incluida). */
router.post("/flows/toggle", AdminFlowController.toggleFlows);
router.post("/flows/:id/toggle", AdminFlowController.toggleFlow);
router.get("/flows/:id", AdminFlowController.edit);
router.post("/flows/:id", AdminFlowController.update);

export default router;
