import { Router } from "express";

import { HomeController } from "../controllers/home.controller";
import { SetupController } from "../controllers/setup.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import authRoutes from "./auth.routes";
import adminRoutes from "./admin.routes";
import agentRoutes from "./agent.routes";
import mediaRoutes from "./media.routes";
import webhookRoutes from "./webhook.routes";


const router = Router();

router.get("/", HomeController.index);

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/agent", agentRoutes);
router.use("/webhooks", webhookRoutes);

/**
 * Archivos que enviaron los clientes (fotos, audio, documentos). Requiere
 * sesión: la autorización por conversación se valida en el controlador.
 */
router.use("/media", authMiddleware, mediaRoutes);

router.get("/como-empezar", HomeController.howToStart);
router.get("/aviso-de-privacidad", HomeController.privacy);
router.get("/setup", SetupController.show);
router.post("/setup", SetupController.submit);

export default router;
