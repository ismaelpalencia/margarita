import { Router } from "express";

import { AdminConversationsController } from "../controllers/admin-conversations.controller";
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

const router = Router();

router.get("/", (req, res) =>
    res.redirect(`/panel/admin/conversations${req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : ""}`)
);
router.get("/data", AdminConversationsController.listData);
router.get("/bulk/template-options", ConversationBulkTemplateController.options);
router.post("/bulk/template-send", ConversationBulkTemplateController.send);
router.post("/bulk/tags", ConversationBulkTagController.update);
router.post("/bulk/actions", ConversationBulkActionController.run);
router.post("/:id/tags", ConversationTagController.update);
router.get("/legacy", AdminConversationsController.index);
router.get("/:id/data", AdminConversationsController.detailData);
router.get("/:id/legacy", AdminConversationsController.show);
router.post("/from-contact/:contactId", AdminConversationsController.openFromContact);

router.get("/:id", (req, res) =>
    res.redirect(`/panel/admin/conversations/${req.params.id}${req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : ""}`)
);
router.post("/:id/messages/local", AdminConversationsController.sendLocalMessage);
router.post("/:id/messages/template", AdminConversationsController.sendTemplateMessage);
router.post(
    "/:id/messages/media",
    mediaUploadSingle("file", (req) => `/admin/conversations/${req.params.id}`),
    AdminConversationsController.sendMediaMessage
);
router.post("/:id/messages/free-text", AdminConversationsController.sendFreeTextMessage);
router.post("/:id/typing", WhatsAppCloudOperationsController.typing);
router.post("/:id/block", WhatsAppCloudOperationsController.setConversationBlocked);
router.post("/:id/reactions", WhatsAppCloudOperationsController.react);
/** Botones dentro de la ventana de 24 horas. */
router.post("/:id/messages/interactive", AdminConversationsController.sendInteractiveMessage);
router.post("/:id/messages/interactive-list", AdminConversationsController.sendInteractiveList);
router.post("/:id/feedback", AdminConversationsController.recordFeedback);
router.post("/:id/claim", AdminConversationsController.claim);
router.post(
    "/:id/lead",
    LeadConversationController.mark("/admin/conversations")
);
router.post("/:id/assign", AdminConversationsController.assign);
router.post("/:id/close", AdminConversationsController.close);
router.post(
    "/:id/guided-flow/approve",
    GuidedFlowConversationController.approve("/admin/conversations")
);
router.post(
    "/:id/guided-flow/end",
    GuidedFlowConversationController.finish("/admin/conversations")
);
router.post("/:id/reopen", AdminConversationsController.reopen);
router.post("/:id/messages/:messageId/delete", AdminConversationsController.deleteMessage);
router.post("/:id/messages/:messageId/restore", AdminConversationsController.restoreMessage);
/** Borradores de IA: usar o descartar. Nunca envían por sí solos. */
router.post(
    "/:id/ai/:suggestionId/use",
    AiSuggestionController.use("/admin/conversations")
);
router.post(
    "/:id/ai/:suggestionId/discard",
    AiSuggestionController.discard("/admin/conversations")
);
/** Interruptor de la IA automática en este hilo. */
router.post(
    "/:id/ai-pause",
    AiConversationController.pause("/admin/conversations")
);
router.post(
    "/:id/ai-resume",
    AiConversationController.resume("/admin/conversations")
);
router.post("/:id/purge", AdminConversationsController.purge);

export default router;
