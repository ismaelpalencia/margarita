-- Importación de negocio asistida por IA (aditivo).
CREATE TYPE "BusinessImportStatus" AS ENUM ('DRAFT', 'APPLIED');

CREATE TABLE "BusinessImport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "status" "BusinessImportStatus" NOT NULL DEFAULT 'DRAFT',
    "result" JSONB NOT NULL,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "BusinessImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BusinessImport_workspaceId_createdAt_idx" ON "BusinessImport"("workspaceId", "createdAt");
CREATE INDEX "BusinessImport_workspaceId_status_idx" ON "BusinessImport"("workspaceId", "status");

ALTER TABLE "BusinessImport" ADD CONSTRAINT "BusinessImport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
