import { Router } from "express";

import { AdminConversationsController } from "../controllers/admin-conversations.controller";

const router = Router();

router.get("/", AdminConversationsController.index);
router.post("/from-contact/:contactId", AdminConversationsController.openFromContact);

router.get("/:id", AdminConversationsController.show);
router.post("/:id/messages/local", AdminConversationsController.sendLocalMessage);
router.post("/:id/messages/template", AdminConversationsController.sendTemplateMessage);
router.post("/:id/messages/free-text", AdminConversationsController.sendFreeTextMessage);
router.post("/:id/assign", AdminConversationsController.assign);
router.post("/:id/close", AdminConversationsController.close);
router.post("/:id/reopen", AdminConversationsController.reopen);

export default router;
