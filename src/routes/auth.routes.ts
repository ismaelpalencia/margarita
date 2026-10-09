import { Router } from "express";

import { AuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.get("/login", AuthController.showLogin);
router.post("/login", AuthController.login);
router.post("/logout", authMiddleware, AuthController.logout);

export default router;
