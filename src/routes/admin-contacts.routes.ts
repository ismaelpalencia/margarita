import { Router } from "express";

import { AdminContactsController } from "../controllers/admin-contacts.controller";
import { OutcomeController } from "../controllers/outcome.controller";

const router = Router();

router.get("/", AdminContactsController.index);
router.get("/new", AdminContactsController.showCreate);
router.post("/", AdminContactsController.create);
/** Antes de las rutas con :id para que no las capture un id. */
router.post("/outcomes/bulk", OutcomeController.markBulk);
router.get("/:id/edit", AdminContactsController.showEdit);
router.post("/:id", AdminContactsController.update);
router.post("/:id/deactivate", AdminContactsController.deactivate);
router.post("/:id/opt-out", AdminContactsController.optOut);
router.post("/:id/opt-in", AdminContactsController.optIn);
router.post("/:id/outcome", OutcomeController.markFromContact);

export default router;
