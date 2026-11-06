import { Router } from "express";

import { AdminWhatsAppController } from "../controllers/admin-whatsapp.controller";

const router = Router();

router.get("/", AdminWhatsAppController.show);
router.post("/account", AdminWhatsAppController.createAccount);
router.post("/credentials", AdminWhatsAppController.updateCredentials);
router.post("/encrypt-secrets", AdminWhatsAppController.encryptSecrets);
router.post("/numbers", AdminWhatsAppController.createNumber);
router.post("/numbers/:numberId", AdminWhatsAppController.updateNumber);
router.post("/numbers/:numberId/toggle", AdminWhatsAppController.toggleNumber);
router.post("/numbers/:numberId/ai", AdminWhatsAppController.toggleNumberAi);
router.post("/numbers/:numberId/test", AdminWhatsAppController.testConnection);

export default router;
