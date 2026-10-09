import { Router } from "express";
import { UserRole } from "@prisma/client";

import { AdminDashboardController } from "../controllers/admin-dashboard.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/role.middleware";
import adminUsersRoutes from "./admin-users.routes";
import adminContactsRoutes from "./admin-contacts.routes";
import adminTagsRoutes from "./admin-tags.routes";
import adminWhatsAppRoutes from "./admin-whatsapp.routes";
import adminTemplatesRoutes from "./admin-templates.routes";
import adminConversationsRoutes from "./admin-conversations.routes";
import adminLogsRoutes from "./admin-logs.routes";
import adminCampaignsRoutes from "./admin-campaigns.routes";
import adminSystemRoutes from "./admin-system.routes";
import adminRoadmapRoutes from "./admin-roadmap.routes";


const router = Router();

router.use(authMiddleware);
router.use(requireRole(UserRole.ADMIN));

router.get("/dashboard", AdminDashboardController.index);
router.use("/users", adminUsersRoutes);
router.use("/contacts", adminContactsRoutes);
router.use("/tags", adminTagsRoutes);
router.use("/whatsapp", adminWhatsAppRoutes);
router.use("/templates", adminTemplatesRoutes);
router.use("/conversations", adminConversationsRoutes);
router.use("/logs", adminLogsRoutes);
router.use("/campaigns", adminCampaignsRoutes);
router.use("/system", adminSystemRoutes);
router.use("/roadmap", adminRoadmapRoutes);

export default router;
