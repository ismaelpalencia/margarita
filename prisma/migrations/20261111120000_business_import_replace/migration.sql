-- Soporte para reemplazo y deshacer importaciones (aditivo).
ALTER TABLE "BusinessImport"
  ADD COLUMN "appliedMode" TEXT,
  ADD COLUMN "replacedKnowledgeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "replacedKnowledge" JSONB,
  ADD COLUMN "replacedSettings" JSONB,
  ADD COLUMN "replacedFlowIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "replacedFlows" JSONB,
  ADD COLUMN "importedKnowledgeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "importedFlowIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "undoneAt" TIMESTAMP(3);
