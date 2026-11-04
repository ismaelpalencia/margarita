import { Router } from "express";

import { AdminConversationsController } from "../controllers/admin-conversations.controller";
import { AiConversationController } from "../controllers/ai-conversation.controller";
import { AiSuggestionController } from "../controllers/ai-suggestion.controller";
import { OutcomeController } from "../controllers/outcome.controller";
import { requireCollectionsModule } from "../middlewares/workspace-profile.middleware";
import { mediaUploadSingle } from "../middlewares/upload.middleware";

const router = Router();

router.get("/", AdminConversationsController.index);
router.post("/from-contact/:contactId", AdminConversationsController.openFromContact);

router.get("/:id", AdminConversationsController.show);
router.post("/:id/messages/local", AdminConversationsController.sendLocalMessage);
router.post("/:id/messages/template", AdminConversationsController.sendTemplateMessage);
router.post(
    "/:id/messages/media",
    mediaUploadSingle("file", (req) => `/admin/conversations/${req.params.id}`),
    AdminConversationsController.sendMediaMessage
);
router.post("/:id/messages/free-text", AdminConversationsController.sendFreeTextMessage);
/** Botones dentro de la ventana de 24 horas. */
router.post("/:id/messages/interactive", AdminConversationsController.sendInteractiveMessage);
router.post(
    "/:id/outcome",
    requireCollectionsModule,
    OutcomeController.markFromConversation({
        basePath: "/admin/conversations",
        forAgent: false
    })
);
router.post("/:id/assign", AdminConversationsController.assign);
router.post("/:id/close", AdminConversationsController.close);
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
