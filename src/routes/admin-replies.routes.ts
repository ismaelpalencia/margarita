import { Router } from "express";

import { AdminRepliesController } from "../controllers/admin-replies.controller";
import { requireCollectionsModule } from "../middlewares/workspace-profile.middleware";

const router = Router();

/** Respuestas de botón que se traducen a resultados de cobranza. */
router.use(requireCollectionsModule);

router.get("/", AdminRepliesController.index);
router.post("/", AdminRepliesController.save);
router.post("/recommended", AdminRepliesController.createRecommended);
router.post("/:id/active", AdminRepliesController.setActive);
router.post("/:id/delete", AdminRepliesController.remove);

export default router;
