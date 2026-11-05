-- Captura de leads y webhook saliente firmado.
-- Aditivo y apagado por defecto: sin leadsEnabled la instalación se comporta
-- exactamente igual que antes. Nombre y correo van cifrados (extensión Prisma);
-- emailHash es el índice ciego para la idempotencia por conversación.

-- AlterEnum
CREATE TYPE "LeadStatus" AS ENUM ('NUEVO', 'CONTACTADO', 'CONVERTIDO', 'DESCARTADO');

-- AlterTable
ALTER TABLE "Workspace"
    ADD COLUMN "leadsEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "leadWebhookUrl" TEXT,
    ADD COLUMN "leadWebhookSecret" TEXT;

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "conversationId" TEXT,
    "name" TEXT,
    "email" TEXT,
    "emailHash" TEXT,
    "interest" TEXT,
    "source" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NUEVO',
    "webhookSentAt" TIMESTAMP(3),
    "webhookFailedAt" TIMESTAMP(3),
    "webhookError" TEXT,
    "webhookAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_workspaceId_conversationId_emailHash_key" ON "Lead"("workspaceId", "conversationId", "emailHash");
CREATE INDEX "Lead_workspaceId_status_idx" ON "Lead"("workspaceId", "status");
CREATE INDEX "Lead_workspaceId_createdAt_idx" ON "Lead"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
