import { Router } from "express";

import { AdminTagsController } from "../controllers/admin-tags.controller";

const router = Router();

router.get("/", AdminTagsController.index);
router.get("/new", AdminTagsController.showCreate);
router.post("/", AdminTagsController.create);
router.get("/:id/edit", AdminTagsController.showEdit);
router.post("/:id", AdminTagsController.update);
router.post("/:id/deactivate", AdminTagsController.deactivate);

export default router;
