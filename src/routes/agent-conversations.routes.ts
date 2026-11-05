import { Router } from "express";

import { AgentConversationsController } from "../controllers/agent-conversations.controller";
import { AiConversationController } from "../controllers/ai-conversation.controller";
import { AiSuggestionController } from "../controllers/ai-suggestion.controller";
import { OutcomeController } from "../controllers/outcome.controller";
import { requireCollectionsModule } from "../middlewares/workspace-profile.middleware";
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
router.post("/:id/messages/interactive", AgentConversationsController.sendInteractiveMessage);
router.post("/:id/messages/interactive-list", AgentConversationsController.sendInteractiveList);
router.post("/:id/feedback", AgentConversationsController.recordFeedback);
router.post("/:id/claim", AgentConversationsController.claim);
router.post(
    "/:id/outcome",
    requireCollectionsModule,
    OutcomeController.markFromConversation({
        basePath: "/agent/conversations",
        forAgent: true
    })
);
router.post("/:id/close", AgentConversationsController.close);
router.post("/:id/messages/:messageId/delete", AgentConversationsController.deleteMessage);
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
