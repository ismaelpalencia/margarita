import { Router } from "express";

import { AdminUsersController } from "../controllers/admin-users.controller";

const router = Router();

router.get("/", AdminUsersController.index);
router.get("/new", AdminUsersController.showCreate);
router.post("/", AdminUsersController.create);
router.get("/:id/edit", AdminUsersController.showEdit);
router.post("/:id", AdminUsersController.update);
router.post("/:id/toggle-status", AdminUsersController.toggleStatus);
router.post("/:id/password", AdminUsersController.resetPassword);
router.post("/:id/unlock", AdminUsersController.unlock);
router.post("/:id/two-factor/disable", AdminUsersController.disableTwoFactor);

export default router;
