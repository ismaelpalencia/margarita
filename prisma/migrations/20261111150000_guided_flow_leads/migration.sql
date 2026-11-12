-- Captura de leads desde flujos guiados (aditivo).
ALTER TABLE "Lead"
  ADD COLUMN "fields" JSONB;

ALTER TABLE "GuidedFlow"
  ADD COLUMN "leadCapture" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "leadNameField" TEXT,
  ADD COLUMN "leadEmailField" TEXT,
  ADD COLUMN "leadInterestField" TEXT;
