import { Router } from "express";
import { UserRole } from "@prisma/client";

import { AgentDashboardController } from "../controllers/agent-dashboard.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import agentConversationsRoutes from "./agent-conversations.routes";
import agentSessionsRoutes from "./agent-sessions.routes";
import { activeNumberMiddleware } from "../middlewares/active-number.middleware";
import { ActiveNumberController } from "../controllers/active-number.controller";

const router = Router();

router.use(authMiddleware);
router.use(requireRole(UserRole.AGENT));
router.use(activeNumberMiddleware);

router.get("/dashboard", AgentDashboardController.index);
router.post("/number/switch", ActiveNumberController.switch);
router.post("/status", AgentDashboardController.updateStatus);
router.use("/conversations", agentConversationsRoutes);
router.use("/sessions", agentSessionsRoutes);

export default router;
