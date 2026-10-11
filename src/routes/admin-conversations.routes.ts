import { Router } from "express";

import { AdminConversationsController } from "../controllers/admin-conversations.controller";
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
router.post("/:id/assign", AdminConversationsController.assign);
router.post("/:id/close", AdminConversationsController.close);
router.post("/:id/reopen", AdminConversationsController.reopen);
router.post("/:id/messages/:messageId/delete", AdminConversationsController.deleteMessage);
router.post("/:id/messages/:messageId/restore", AdminConversationsController.restoreMessage);
router.post("/:id/purge", AdminConversationsController.purge);

export default router;
