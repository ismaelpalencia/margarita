import { Router } from "express";

import { AdminWhatsAppController } from "../controllers/admin-whatsapp.controller";
import { WhatsAppCloudOperationsController } from "../controllers/whatsapp-cloud-operations.controller";

const router = Router();

router.get("/", AdminWhatsAppController.show);
router.post("/account", AdminWhatsAppController.createAccount);
router.post("/credentials", AdminWhatsAppController.updateCredentials);
router.post("/encrypt-secrets", AdminWhatsAppController.encryptSecrets);
router.post("/numbers", AdminWhatsAppController.createNumber);
router.post("/numbers/:numberId", AdminWhatsAppController.updateNumber);
router.post("/numbers/:numberId/toggle", AdminWhatsAppController.toggleNumber);
router.post("/numbers/:numberId/ai", AdminWhatsAppController.toggleNumberAi);
router.post("/numbers/:numberId/flows", AdminWhatsAppController.toggleNumberFlows);
router.post("/numbers/:numberId/guided-flows", AdminWhatsAppController.toggleNumberGuidedFlows);
router.post("/numbers/:numberId/test", AdminWhatsAppController.testConnection);
router.get("/account-health", WhatsAppCloudOperationsController.accountHealth);
router.get("/analytics", WhatsAppCloudOperationsController.accountAnalytics);
router.get("/numbers/:numberId/profile", WhatsAppCloudOperationsController.profile);
router.post("/numbers/:numberId/profile", WhatsAppCloudOperationsController.profile);
router.get("/numbers/:numberId/health", WhatsAppCloudOperationsController.health);
router.get("/numbers/:numberId/blocked-users", WhatsAppCloudOperationsController.blockUsers);
router.post("/numbers/:numberId/blocked-users", WhatsAppCloudOperationsController.blockUsers);
router.delete("/numbers/:numberId/blocked-users", WhatsAppCloudOperationsController.blockUsers);
router.delete("/media/:mediaId", WhatsAppCloudOperationsController.deleteMedia);

export default router;
