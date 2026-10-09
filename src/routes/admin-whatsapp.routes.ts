import { Router } from "express";

import { AdminWhatsAppController } from "../controllers/admin-whatsapp.controller";

const router = Router();

router.get("/", AdminWhatsAppController.show);
router.post("/credentials", AdminWhatsAppController.updateCredentials);
router.post("/encrypt-secrets", AdminWhatsAppController.encryptSecrets);
router.post("/test-connection", AdminWhatsAppController.testConnection);

export default router;
