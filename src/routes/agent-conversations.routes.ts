import { Router } from "express";

import { AgentConversationsController } from "../controllers/agent-conversations.controller";

const router = Router();

router.get("/", AgentConversationsController.index);
router.get("/:id", AgentConversationsController.show);
router.post("/:id/messages/local", AgentConversationsController.sendLocalMessage);
router.post("/:id/messages/template", AgentConversationsController.sendTemplateMessage);
router.post("/:id/messages/free-text", AgentConversationsController.sendFreeTextMessage);
router.post("/:id/close", AgentConversationsController.close);

export default router;
