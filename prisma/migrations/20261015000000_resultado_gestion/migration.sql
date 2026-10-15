-- Resultado de gestión por cliente (cobranza) con historial.
--
-- `Contact.outcome*` guarda el estado vigente, denormalizado, para poder
-- filtrar y listar sin recorrer el historial; `ContactOutcome` guarda cada
-- marcado con quién y cuándo.
--
-- Nota sobre la promesa incumplida: NO se guarda automáticamente. Se deduce
-- de `outcomeDueAt` (promesa vencida y sin pago registrado), así que si el
-- cliente paga después, marcar `PAID` la resuelve sin deshacer nada. El tipo
-- `PROMISE_BROKEN` es para cuando una persona confirma el incumplimiento.

-- CreateEnum
CREATE TYPE "ContactOutcomeType" AS ENUM ('PROMISE', 'PROMISE_BROKEN', 'PAID', 'CONVENIO', 'NO_ANSWER', 'WRONG_NUMBER', 'NOT_INTERESTED', 'CALLBACK', 'OTHER');

-- AlterTable
ALTER TABLE "Contact"
ADD COLUMN     "outcomeType" "ContactOutcomeType",
ADD COLUMN     "outcomeAt" TIMESTAMP(3),
ADD COLUMN     "outcomeById" TEXT,
ADD COLUMN     "outcomeAmount" TEXT,
ADD COLUMN     "outcomeDueAt" TIMESTAMP(3),
ADD COLUMN     "outcomePaidAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ContactOutcome" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "conversationId" TEXT,
    "createdById" TEXT,
    "type" "ContactOutcomeType" NOT NULL,
    "note" TEXT,
    "amount" TEXT,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'PANEL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactOutcome_workspaceId_createdAt_idx" ON "ContactOutcome"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactOutcome_workspaceId_type_idx" ON "ContactOutcome"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "ContactOutcome_workspaceId_dueAt_idx" ON "ContactOutcome"("workspaceId", "dueAt");

-- CreateIndex
CREATE INDEX "ContactOutcome_contactId_createdAt_idx" ON "ContactOutcome"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_outcomeType_idx" ON "Contact"("outcomeType");

-- CreateIndex
CREATE INDEX "Contact_outcomeDueAt_idx" ON "Contact"("outcomeDueAt");

-- AddForeignKey
ALTER TABLE "ContactOutcome" ADD CONSTRAINT "ContactOutcome_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactOutcome" ADD CONSTRAINT "ContactOutcome_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactOutcome" ADD CONSTRAINT "ContactOutcome_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactOutcome" ADD CONSTRAINT "ContactOutcome_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
