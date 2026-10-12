import { Router } from "express";

import { AdminQuickRepliesController } from "../controllers/admin-quick-replies.controller";

const router = Router();

router.get("/", AdminQuickRepliesController.index);
router.post("/", AdminQuickRepliesController.create);
router.get("/:id/edit", AdminQuickRepliesController.showEdit);
router.post("/:id", AdminQuickRepliesController.update);
router.post("/:id/active", AdminQuickRepliesController.setActive);

export default router;
