-- Flujos precargados por vertical.
-- Aditivo y apagado por defecto: sin flowsEnabled (y sin flujos cargados) la
-- instalación se comporta exactamente igual que antes. sourceKey de la base de
-- conocimiento permite cargar dos veces sin duplicar entradas.

-- AlterTable
ALTER TABLE "Workspace"
    ADD COLUMN "flowsEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "KnowledgeEntry"
    ADD COLUMN "sourceKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeEntry_workspaceId_sourceKey_key" ON "KnowledgeEntry"("workspaceId", "sourceKey");

-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "reply" TEXT NOT NULL,
    "buttons" JSONB,
    "list" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Flow_workspaceId_slug_key" ON "Flow"("workspaceId", "slug");
CREATE INDEX "Flow_workspaceId_isActive_idx" ON "Flow"("workspaceId", "isActive");

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
