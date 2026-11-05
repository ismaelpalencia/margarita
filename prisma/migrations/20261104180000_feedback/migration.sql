-- Valoración opcional 👍/👎 al cerrar una conversación.
-- Aditivo y apagado por defecto: sin feedbackEnabled no hay formulario.

CREATE TYPE "FeedbackValue" AS ENUM ('UP', 'DOWN');

ALTER TABLE "Workspace"
    ADD COLUMN "feedbackEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ConversationFeedback" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "value" "FeedbackValue" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConversationFeedback_conversationId_key" ON "ConversationFeedback"("conversationId");
CREATE INDEX "ConversationFeedback_workspaceId_createdAt_idx" ON "ConversationFeedback"("workspaceId", "createdAt");

ALTER TABLE "ConversationFeedback" ADD CONSTRAINT "ConversationFeedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationFeedback" ADD CONSTRAINT "ConversationFeedback_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
