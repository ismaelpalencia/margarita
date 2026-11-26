import { Router } from "express";
import { CallsController } from "../controllers/calls.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();
router.get("/token", authMiddleware, CallsController.token);
router.post("/reception", authMiddleware, CallsController.setReception);
router.get("/eligibility/:conversationId", authMiddleware, CallsController.eligibility);
router.get("/active", authMiddleware, CallsController.active);
router.get("/conversations/:conversationId", authMiddleware, CallsController.history);
router.get("/:id", authMiddleware, CallsController.detail);
export default router;
