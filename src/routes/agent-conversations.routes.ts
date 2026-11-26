import { Router } from "express";

import { AgentConversationsController } from "../controllers/agent-conversations.controller";
import { AiConversationController } from "../controllers/ai-conversation.controller";
import { GuidedFlowConversationController } from "../controllers/guided-flow-conversation.controller";
import { LeadConversationController } from "../controllers/lead-conversation.controller";
import { AiSuggestionController } from "../controllers/ai-suggestion.controller";
import { mediaUploadSingle } from "../middlewares/upload.middleware";
import { WhatsAppCloudOperationsController } from "../controllers/whatsapp-cloud-operations.controller";
import { ConversationBulkTemplateController } from "../controllers/conversation-bulk-template.controller";
import { ConversationTagController } from "../controllers/conversation-tag.controller";
import { ConversationBulkTagController } from "../controllers/conversation-bulk-tag.controller";
import { ConversationBulkActionController } from "../controllers/conversation-bulk-action.controller";
import { ConversationBulkQuickReplyController } from "../controllers/conversation-bulk-quick-reply.controller";

const router = Router();

router.get("/", (req, res) =>
    res.redirect(`/panel/agent/conversations${req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : ""}`)
);
router.get("/data", AgentConversationsController.listData);
router.get("/bulk/template-options", ConversationBulkTemplateController.options);
router.post("/bulk/template-send", ConversationBulkTemplateController.send);
router.get("/bulk/quick-reply-options", ConversationBulkQuickReplyController.options);
router.post("/bulk/quick-reply-send", ConversationBulkQuickReplyController.send);
router.post("/bulk/tags", ConversationBulkTagController.update);
router.post("/bulk/actions", ConversationBulkActionController.run);
router.post("/:id/tags", ConversationTagController.update);
router.get("/legacy", AgentConversationsController.index);
router.get("/:id/data", AgentConversationsController.detailData);
router.get("/:id/legacy", AgentConversationsController.show);
router.get("/:id", (req, res) =>
    res.redirect(`/panel/agent/conversations/${req.params.id}${req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : ""}`)
);
router.post("/:id/messages/local", AgentConversationsController.sendLocalMessage);
router.post("/:id/messages/template", AgentConversationsController.sendTemplateMessage);
router.post(
    "/:id/messages/media",
    mediaUploadSingle("file", (req) => `/agent/conversations/${req.params.id}`),
    AgentConversationsController.sendMediaMessage
);
router.post("/:id/messages/free-text", AgentConversationsController.sendFreeTextMessage);
router.post("/:id/typing", WhatsAppCloudOperationsController.typing);
router.post("/:id/block", WhatsAppCloudOperationsController.setConversationBlocked);
router.post("/:id/reactions", WhatsAppCloudOperationsController.react);
router.post("/:id/messages/interactive", AgentConversationsController.sendInteractiveMessage);
router.post("/:id/messages/interactive-list", AgentConversationsController.sendInteractiveList);
router.post("/:id/feedback", AgentConversationsController.recordFeedback);
router.post("/:id/claim", AgentConversationsController.claim);
router.post(
    "/:id/lead",
    LeadConversationController.mark("/agent/conversations")
);
router.post("/:id/close", AgentConversationsController.close);
router.post(
    "/:id/guided-flow/approve",
    GuidedFlowConversationController.approve("/agent/conversations")
);
router.post(
    "/:id/guided-flow/end",
    GuidedFlowConversationController.finish("/agent/conversations")
);
router.post("/:id/messages/:messageId/delete", AgentConversationsController.deleteMessage);
router.post("/:id/archive", AgentConversationsController.archive);
router.post("/:id/unarchive", AgentConversationsController.unarchive);
/** Borradores de IA: usar o descartar. Nunca envían por sí solos. */
router.post(
    "/:id/ai/:suggestionId/use",
    AiSuggestionController.use("/agent/conversations")
);
router.post(
    "/:id/ai/:suggestionId/discard",
    AiSuggestionController.discard("/agent/conversations")
);
/** Interruptor de la IA automática en este hilo. */
router.post(
    "/:id/ai-pause",
    AiConversationController.pause("/agent/conversations")
);
router.post(
    "/:id/ai-resume",
    AiConversationController.resume("/agent/conversations")
);

export default router;
