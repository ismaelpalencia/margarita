import { Router } from "express";
import { UserRole } from "@prisma/client";

import { AgentDashboardController } from "../controllers/agent-dashboard.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import agentConversationsRoutes from "./agent-conversations.routes";

const router = Router();

router.use(authMiddleware);
router.use(requireRole(UserRole.AGENT));

router.get("/dashboard", AgentDashboardController.index);
router.post("/status", AgentDashboardController.updateStatus);
router.use("/conversations", agentConversationsRoutes);

export default router;
