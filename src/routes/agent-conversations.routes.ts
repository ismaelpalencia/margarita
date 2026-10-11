import { Router } from "express";

import { AgentConversationsController } from "../controllers/agent-conversations.controller";
import { mediaUploadSingle } from "../middlewares/upload.middleware";

const router = Router();

router.get("/", AgentConversationsController.index);
router.get("/:id", AgentConversationsController.show);
router.post("/:id/messages/local", AgentConversationsController.sendLocalMessage);
router.post("/:id/messages/template", AgentConversationsController.sendTemplateMessage);
router.post(
    "/:id/messages/media",
    mediaUploadSingle("file", (req) => `/agent/conversations/${req.params.id}`),
    AgentConversationsController.sendMediaMessage
);
router.post("/:id/messages/free-text", AgentConversationsController.sendFreeTextMessage);
router.post("/:id/close", AgentConversationsController.close);
router.post("/:id/messages/:messageId/delete", AgentConversationsController.deleteMessage);

export default router;
