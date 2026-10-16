import { Router } from "express";

import { AdminRepliesController } from "../controllers/admin-replies.controller";

const router = Router();

router.get("/", AdminRepliesController.index);
router.post("/", AdminRepliesController.save);
router.post("/recommended", AdminRepliesController.createRecommended);
router.post("/:id/active", AdminRepliesController.setActive);
router.post("/:id/delete", AdminRepliesController.remove);

export default router;
