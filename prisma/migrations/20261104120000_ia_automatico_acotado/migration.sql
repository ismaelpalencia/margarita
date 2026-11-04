-- IA automática acotada (fase 2).
--
-- Todo es aditivo: la instalación sigue funcionando igual mientras el modo
-- sea `SUGGEST` u `OFF`. No se enciende nada por defecto.
--
-- 1. Pausa de la IA por conversación (control humano inmediato).
-- 2. Límites de respuestas automáticas y presupuesto mensual.
-- 3. Costo estimado por llamada al modelo.
-- 4. Trazabilidad del mensaje que envió la IA.

-- AlterEnum
ALTER TYPE "AiSuggestionStatus" ADD VALUE IF NOT EXISTS 'AUTO_SENT';
ALTER TYPE "AiSuggestionStatus" ADD VALUE IF NOT EXISTS 'HANDOFF';

-- AlterTable
ALTER TABLE "Conversation"
    ADD COLUMN "aiPausedAt" TIMESTAMP(3),
    ADD COLUMN "aiPausedById" TEXT,
    ADD COLUMN "aiHandoffAt" TIMESTAMP(3),
    ADD COLUMN "aiHandoffReason" TEXT;

-- AlterTable
ALTER TABLE "AiSettings"
    ADD COLUMN "maxRepliesPerThread" INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN "monthlyBudgetCents" INTEGER NOT NULL DEFAULT 500;

-- AlterTable
ALTER TABLE "AiUsage" ADD COLUMN "costMicros" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Message"
    ADD COLUMN "aiSuggestionId" TEXT,
    ADD COLUMN "aiModel" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Message_aiSuggestionId_key" ON "Message"("aiSuggestionId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_aiPausedById_fkey" FOREIGN KEY ("aiPausedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_aiSuggestionId_fkey" FOREIGN KEY ("aiSuggestionId") REFERENCES "AiSuggestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
