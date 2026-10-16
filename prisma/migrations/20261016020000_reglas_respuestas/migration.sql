-- Fase 3: el puente entre la respuesta de un botón y el resultado de gestión.
--
-- Tres cosas:
--
-- 1. Dos resultados nuevos en el catálogo. `REPORTED_PAYMENT` existe para que
--    «ya pagué» **no** se confunda con un pago confirmado: entra como reportado
--    por el deudor y pendiente de conciliar. `DISPUTED` marca la cuenta que el
--    deudor dice no reconocer.
-- 2. La tabla de reglas, que traduce el `id` de un botón (o su texto, como
--    respaldo) al resultado de gestión, con un efecto opcional.
-- 3. La pausa del contacto: reversible, y mientras tenga fecha no se le
--    escribe.
--
-- Migración aditiva: no toca datos existentes.

-- AlterEnum
ALTER TYPE "ContactOutcomeType" ADD VALUE 'REPORTED_PAYMENT';
ALTER TYPE "ContactOutcomeType" ADD VALUE 'DISPUTED';

-- CreateEnum
CREATE TYPE "ReplyEffect" AS ENUM ('NONE', 'PAUSE_ACCOUNT', 'OPT_OUT');

-- AlterTable
ALTER TABLE "Contact"
ADD COLUMN     "pausedAt" TIMESTAMP(3),
ADD COLUMN     "pausedReason" TEXT;

CREATE INDEX "Contact_pausedAt_idx" ON "Contact"("pausedAt");

-- CreateTable
CREATE TABLE "InteractiveReplyRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "replyId" TEXT NOT NULL,
    "replyTitle" TEXT,
    "outcomeType" "ContactOutcomeType" NOT NULL,
    "effect" "ReplyEffect" NOT NULL DEFAULT 'NONE',
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InteractiveReplyRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InteractiveReplyRule_workspaceId_replyId_key"
    ON "InteractiveReplyRule"("workspaceId", "replyId");

CREATE INDEX "InteractiveReplyRule_workspaceId_idx"
    ON "InteractiveReplyRule"("workspaceId");

ALTER TABLE "InteractiveReplyRule"
ADD CONSTRAINT "InteractiveReplyRule_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
