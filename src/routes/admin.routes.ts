import { Router } from "express";
import { UserRole } from "@prisma/client";

import { AdminDashboardController } from "../controllers/admin-dashboard.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import adminUsersRoutes from "./admin-users.routes";
import adminContactsRoutes from "./admin-contacts.routes";
import adminQuickRepliesRoutes from "./admin-quick-replies.routes";
import adminRepliesRoutes from "./admin-replies.routes";
import adminReportsRoutes from "./admin-reports.routes";
import adminSessionsRoutes from "./admin-sessions.routes";
import adminTagsRoutes from "./admin-tags.routes";
import adminWhatsAppRoutes from "./admin-whatsapp.routes";
import adminTemplatesRoutes from "./admin-templates.routes";
import adminConversationsRoutes from "./admin-conversations.routes";
import adminLogsRoutes from "./admin-logs.routes";
import adminCampaignsRoutes from "./admin-campaigns.routes";
import adminAiRoutes from "./admin-ai.routes";
import adminSystemRoutes from "./admin-system.routes";
import adminGuideRoutes from "./admin-guide.routes";
import adminBackupRoutes from "./admin-backup.routes";
import adminHoursRoutes from "./admin-hours.routes";
import adminLeadsRoutes from "./admin-leads.routes";
import { AdminServiceMetricsController } from "../controllers/admin-service-metrics.controller";
import { activeNumberMiddleware } from "../middlewares/active-number.middleware";
import { workspaceProfileMiddleware } from "../middlewares/workspace-profile.middleware";
import { ActiveNumberController } from "../controllers/active-number.controller";
import { panelRateLimiter } from "../middlewares/panel-rate-limit.middleware";


const router = Router();

router.use(authMiddleware);
router.use(requireRole(UserRole.ADMIN));
/** El giro de la instalación decide qué módulos se muestran. */
router.use(workspaceProfileMiddleware);
router.use(activeNumberMiddleware);
/** Cupo por persona: quince agentes en la misma oficina no se estorban. */
router.use(panelRateLimiter);

router.get("/dashboard", AdminDashboardController.index);
router.post("/number/switch", ActiveNumberController.switch);
router.use("/users", adminUsersRoutes);
router.use("/contacts", adminContactsRoutes);
router.use("/quick-replies", adminQuickRepliesRoutes);
/** Respuestas de botón: qué significa cada toque del deudor. */
router.use("/replies", adminRepliesRoutes);
/** Métricas de servicio (todos los giros), antes del módulo legado de reportes. */
router.get("/reports/service", AdminServiceMetricsController.index);
router.use("/reports", adminReportsRoutes);
router.use("/sessions", adminSessionsRoutes);
router.use("/tags", adminTagsRoutes);
router.use("/whatsapp", adminWhatsAppRoutes);
router.use("/templates", adminTemplatesRoutes);
router.use("/conversations", adminConversationsRoutes);
router.use("/logs", adminLogsRoutes);
router.use("/campaigns", adminCampaignsRoutes);
/** IA: ajustes, base de conocimiento y consola de prueba. */
router.use("/ai", adminAiRoutes);
router.use("/system", adminSystemRoutes);
/** Horarios de atención y modo fuera de horario. */
router.use("/hours", adminHoursRoutes);
/** Leads capturados y exportación. */
router.use("/leads", adminLeadsRoutes);
/** Guía del producto para el equipo del cliente (antes: roadmap interno). */
router.use("/guia", adminGuideRoutes);
router.use("/backup", adminBackupRoutes);

export default router;
