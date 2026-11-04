import { Router } from "express";
import { UserRole } from "@prisma/client";

import { AgentDashboardController } from "../controllers/agent-dashboard.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import agentConversationsRoutes from "./agent-conversations.routes";
import agentSessionsRoutes from "./agent-sessions.routes";
import { activeNumberMiddleware } from "../middlewares/active-number.middleware";
import { workspaceProfileMiddleware } from "../middlewares/workspace-profile.middleware";
import { ActiveNumberController } from "../controllers/active-number.controller";
import { panelRateLimiter } from "../middlewares/panel-rate-limit.middleware";

const router = Router();

router.use(authMiddleware);
router.use(requireRole(UserRole.AGENT));
/** El agente también ve solo los módulos del giro configurado. */
router.use(workspaceProfileMiddleware);
router.use(activeNumberMiddleware);
/** El cupo es de la persona, no de la IP compartida de la oficina. */
router.use(panelRateLimiter);

router.get("/dashboard", AgentDashboardController.index);
router.post("/number/switch", ActiveNumberController.switch);
router.post("/status", AgentDashboardController.updateStatus);
router.use("/conversations", agentConversationsRoutes);
router.use("/sessions", agentSessionsRoutes);

export default router;
