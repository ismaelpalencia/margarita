import { Router } from "express";

import { HomeController } from "../controllers/home.controller";
import authRoutes from "./auth.routes";
import adminRoutes from "./admin.routes";
import agentRoutes from "./agent.routes";
import webhookRoutes from "./webhook.routes";


const router = Router();

router.get("/", HomeController.index);

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/agent", agentRoutes);
router.use("/webhooks", webhookRoutes);
router.get("/como-empezar", HomeController.howToStart);

export default router;
