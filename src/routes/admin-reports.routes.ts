import { Router } from "express";

import { AdminReportsController } from "../controllers/admin-reports.controller";
import { requireCollectionsModule } from "../middlewares/workspace-profile.middleware";

const router = Router();

/** Reportes de gestiones, promesas y montos: solo con cobranza encendida. */
router.use(requireCollectionsModule);

router.get("/", AdminReportsController.index);
router.get("/export", AdminReportsController.export);
router.post("/mark-no-answer", AdminReportsController.markNoAnswer);
/** El atajo de la lista de llamadas («llamé y no contestó»). */
router.post("/mark-call", AdminReportsController.markCallResult);
/** Agendar o quitar la cita de una llamada pedida. */
router.post("/schedule-call", AdminReportsController.scheduleCall);

export default router;
