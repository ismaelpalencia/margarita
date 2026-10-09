import { Router } from "express";

import { AdminUsersController } from "../controllers/admin-users.controller";

const router = Router();

router.get("/", AdminUsersController.index);
router.get("/new", AdminUsersController.showCreate);
router.post("/", AdminUsersController.create);
router.get("/:id/edit", AdminUsersController.showEdit);
router.post("/:id", AdminUsersController.update);
router.post("/:id/toggle-status", AdminUsersController.toggleStatus);

export default router;
