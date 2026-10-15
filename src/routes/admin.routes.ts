import { Router } from "express";
import { UserRole } from "@prisma/client";

import { AdminDashboardController } from "../controllers/admin-dashboard.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import adminUsersRoutes from "./admin-users.routes";
import adminContactsRoutes from "./admin-contacts.routes";
import adminQuickRepliesRoutes from "./admin-quick-replies.routes";
import adminReportsRoutes from "./admin-reports.routes";
import adminSessionsRoutes from "./admin-sessions.routes";
import adminTagsRoutes from "./admin-tags.routes";
import adminWhatsAppRoutes from "./admin-whatsapp.routes";
import adminTemplatesRoutes from "./admin-templates.routes";
import adminConversationsRoutes from "./admin-conversations.routes";
import adminLogsRoutes from "./admin-logs.routes";
import adminCampaignsRoutes from "./admin-campaigns.routes";
import adminSystemRoutes from "./admin-system.routes";
import adminRoadmapRoutes from "./admin-roadmap.routes";
import adminBackupRoutes from "./admin-backup.routes";
import { activeNumberMiddleware } from "../middlewares/active-number.middleware";
import { ActiveNumberController } from "../controllers/active-number.controller";


const router = Router();

router.use(authMiddleware);
router.use(requireRole(UserRole.ADMIN));
router.use(activeNumberMiddleware);

router.get("/dashboard", AdminDashboardController.index);
router.post("/number/switch", ActiveNumberController.switch);
router.use("/users", adminUsersRoutes);
router.use("/contacts", adminContactsRoutes);
router.use("/quick-replies", adminQuickRepliesRoutes);
router.use("/reports", adminReportsRoutes);
router.use("/sessions", adminSessionsRoutes);
router.use("/tags", adminTagsRoutes);
router.use("/whatsapp", adminWhatsAppRoutes);
router.use("/templates", adminTemplatesRoutes);
router.use("/conversations", adminConversationsRoutes);
router.use("/logs", adminLogsRoutes);
router.use("/campaigns", adminCampaignsRoutes);
router.use("/system", adminSystemRoutes);
router.use("/roadmap", adminRoadmapRoutes);
router.use("/backup", adminBackupRoutes);

export default router;
