-- Archivar conversaciones sin borrar su historial.
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Conversation_archivedAt_idx" ON "Conversation"("archivedAt");
