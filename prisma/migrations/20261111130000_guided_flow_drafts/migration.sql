-- Borradores de flujos guiados generados por IA (aditivo).
ALTER TABLE "GuidedFlow"
  ADD COLUMN "isDraft" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "draftSummary" TEXT,
  ADD COLUMN "draftMissing" JSONB;
