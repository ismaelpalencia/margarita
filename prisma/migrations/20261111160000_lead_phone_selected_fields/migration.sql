-- Nombre/teléfono del lead y selección de campos del flujo (aditivo).
ALTER TABLE "Lead"
  ADD COLUMN "phone" TEXT;

ALTER TABLE "GuidedFlow"
  ADD COLUMN "leadFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
