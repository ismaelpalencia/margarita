-- Índice ciego del nombre para búsqueda exacta sin guardarlo en claro.
ALTER TABLE "Contact" ADD COLUMN "nameHash" TEXT;
CREATE INDEX "Contact_workspaceId_nameHash_idx" ON "Contact"("workspaceId", "nameHash");
