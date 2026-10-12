import { Router } from "express";

import { AdminContactsController } from "../controllers/admin-contacts.controller";

const router = Router();

router.get("/", AdminContactsController.index);
router.get("/new", AdminContactsController.showCreate);
router.post("/", AdminContactsController.create);
router.get("/:id/edit", AdminContactsController.showEdit);
router.post("/:id", AdminContactsController.update);
router.post("/:id/deactivate", AdminContactsController.deactivate);
router.post("/:id/opt-out", AdminContactsController.optOut);
router.post("/:id/opt-in", AdminContactsController.optIn);

export default router;
