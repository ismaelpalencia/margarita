import { Router } from "express";
import path from "node:path";

import { HomeController } from "../controllers/home.controller";
import { SetupController } from "../controllers/setup.controller";
import { PanelShellController } from "../controllers/panel-shell.controller";
import { activeNumberMiddleware } from "../middlewares/active-number.middleware";
import { authMiddleware } from "../middlewares/auth.middleware";
import { AccountController } from "../controllers/admin-users.controller";
import { requireRole } from "../middlewares/role.middleware";
import { UserRole } from "@prisma/client";
import authRoutes from "./auth.routes";
import adminRoutes from "./admin.routes";
import agentRoutes from "./agent.routes";
import mediaRoutes from "./media.routes";
import pushRoutes from "./push.routes";
import webhookRoutes from "./webhook.routes";


const router = Router();

/** Angular se sirve bajo la sesión actual; sus bundles salen por /angular. */
const angularPanel = (_req: import("express").Request, res: import("express").Response) =>
    res.sendFile(path.join(process.cwd(), "src", "public", "angular", "index.html"));

router.get("/panel/login", angularPanel);
/** Armazón del panel: números y contadores para la navegación Angular. */
router.get(
    "/panel/shell",
    authMiddleware,
    activeNumberMiddleware,
    PanelShellController.data
);
/** El armazón decide a qué resumen mandar según el rol (ver `NotFoundPage`). */
router.get("/panel", authMiddleware, angularPanel);
router.get("/panel/admin/whatsapp", authMiddleware, requireRole(UserRole.ADMIN), angularPanel);
router.get("/panel/admin/backup", authMiddleware, requireRole(UserRole.ADMIN), angularPanel);
router.get("/panel/admin/system", authMiddleware, requireRole(UserRole.ADMIN), angularPanel);
router.get("/panel/admin/*", authMiddleware, requireRole(UserRole.ADMIN), angularPanel);
router.get("/panel/agent", authMiddleware, requireRole(UserRole.AGENT), angularPanel);
router.get("/panel/agent/*", authMiddleware, requireRole(UserRole.AGENT), angularPanel);

router.get("/", HomeController.index);
/** Oferta de IA con control humano: la puerta que pide el mercado de soporte. */
router.get("/ia", HomeController.ai);

router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/agent", agentRoutes);
router.use("/webhooks", webhookRoutes);

/**
 * Archivos que enviaron los clientes (fotos, audio, documentos). Requiere
 * sesión: la autorización por conversación se valida en el controlador.
 */
router.use("/media", authMiddleware, mediaRoutes);
router.use("/api/push", authMiddleware, pushRoutes);

router.get("/como-empezar", HomeController.howToStart);
/** Alta guiada de una página: qué traer, en qué orden y cómo se comprueba. */
router.get("/onboarding", HomeController.onboarding);
/** Manual del equipo: público, para mandarlo por WhatsApp. */
router.get("/guia", HomeController.guide);
/** Guía de plantillas: la que se entrega al contratar. */
router.get("/plantillas", HomeController.templatesGuide);
/** Propuesta comercial para el sitio público. */
router.get("/propuesta", HomeController.proposal);
router.get("/acceso", HomeController.access);
/**
 * Cambio de contraseña: la misma pantalla para administradores y agentes.
 */
router.get("/account/password", authMiddleware, AccountController.show);
router.post("/account/password", authMiddleware, AccountController.change);
/**
 * Verificación en dos pasos: la misma pantalla para administradores y
 * agentes. La activación lleva dos pasos (generar la clave y confirmar un
 * código) para que nadie se quede fuera por escanear mal.
 */
router.get("/account/notifications", authMiddleware, AccountController.showNotifications);
router.post("/account/notifications", authMiddleware, AccountController.saveNotifications);
router.get("/account/security", authMiddleware, AccountController.showSecurity);
router.post(
    "/account/security/two-factor/start",
    authMiddleware,
    AccountController.startTwoFactor
);
router.post(
    "/account/security/two-factor/confirm",
    authMiddleware,
    AccountController.confirmTwoFactor
);
router.post(
    "/account/security/two-factor/disable",
    authMiddleware,
    AccountController.disableTwoFactor
);
router.post(
    "/account/security/two-factor/cancel",
    authMiddleware,
    AccountController.cancelTwoFactor
);
router.get("/aviso-de-privacidad", HomeController.privacy);
router.get("/setup", SetupController.show);
router.post("/setup", SetupController.submit);

export default router;
