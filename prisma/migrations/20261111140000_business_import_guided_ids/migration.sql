-- IDs de flujos guiados creados por una importación (aditivo).
ALTER TABLE "BusinessImport"
  ADD COLUMN "importedGuidedFlowIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
