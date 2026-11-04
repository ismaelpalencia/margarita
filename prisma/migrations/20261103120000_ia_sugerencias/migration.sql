-- IA en modo sugerencia (fase 1).
--
-- Crea la configuración por workspace, la base de conocimiento, la cola de
-- generación, los borradores y el consumo de tokens. No toca columnas
-- existentes más allá de `Workspace.profile`, que llega con `COBRANZA` por
-- defecto para que una instalación en producción siga exactamente igual.
--
-- Nada de esto envía mensajes: el borrador lo revisa una persona. El envío
-- automático es una fase posterior.

-- CreateEnum
CREATE TYPE "WorkspaceProfile" AS ENUM ('COBRANZA', 'COMERCIO', 'SERVICIOS', 'GENERICO');

-- CreateEnum
CREATE TYPE "AiMode" AS ENUM ('OFF', 'SUGGEST', 'AUTO');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiSuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EDITED', 'DISCARDED', 'SUPERSEDED');

-- AlterEnum
ALTER TYPE "LogModule" ADD VALUE 'AI';

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "profile" "WorkspaceProfile" NOT NULL DEFAULT 'COBRANZA';

-- CreateTable
CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" "AiMode" NOT NULL DEFAULT 'SUGGEST',
    "systemPrompt" TEXT,
    "tone" TEXT,
    "language" TEXT NOT NULL DEFAULT 'es-MX',
    "confidenceMin" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxRepliesPerDay" INTEGER NOT NULL DEFAULT 50,
    "handoffKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "model" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSuggestionJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "inboundMessageId" TEXT NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "skipReason" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSuggestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSuggestion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "inboundMessageId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "intent" TEXT,
    "handoff" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "model" TEXT NOT NULL,
    "status" "AiSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT,
    "suggestionId" TEXT,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiSettings_workspaceId_key" ON "AiSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "AiSettings_workspaceId_idx" ON "AiSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_workspaceId_isActive_idx" ON "KnowledgeEntry"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "KnowledgeEntry_workspaceId_priority_idx" ON "KnowledgeEntry"("workspaceId", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "AiSuggestionJob_inboundMessageId_key" ON "AiSuggestionJob"("inboundMessageId");

-- CreateIndex
CREATE INDEX "AiSuggestionJob_status_runAfter_idx" ON "AiSuggestionJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "AiSuggestionJob_workspaceId_idx" ON "AiSuggestionJob"("workspaceId");

-- CreateIndex
CREATE INDEX "AiSuggestionJob_conversationId_idx" ON "AiSuggestionJob"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "AiSuggestion_inboundMessageId_key" ON "AiSuggestion"("inboundMessageId");

-- CreateIndex
CREATE INDEX "AiSuggestion_workspaceId_createdAt_idx" ON "AiSuggestion"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AiSuggestion_conversationId_status_idx" ON "AiSuggestion"("conversationId", "status");

-- CreateIndex
CREATE INDEX "AiSuggestion_status_idx" ON "AiSuggestion"("status");

-- CreateIndex
CREATE INDEX "AiUsage_workspaceId_createdAt_idx" ON "AiUsage"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiSettings" ADD CONSTRAINT "AiSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSettings" ADD CONSTRAINT "AiSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEntry" ADD CONSTRAINT "KnowledgeEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSuggestionJob" ADD CONSTRAINT "AiSuggestionJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSuggestionJob" ADD CONSTRAINT "AiSuggestionJob_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSuggestion" ADD CONSTRAINT "AiSuggestion_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
