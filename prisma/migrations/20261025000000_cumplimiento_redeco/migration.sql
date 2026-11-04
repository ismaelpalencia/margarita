-- Quejas y cumplimiento (esquema base).
--
-- Deja lista la estructura para registrar quejas por contacto (motivo, canal,
-- estado, evidencia y quién la abrió/cerró) y los medios de contacto
-- autorizados de la empresa, además de los datos legales del workspace y la
-- ventana horaria autorizada.
--
-- Esta migración es **solo estructura**: todavía no hay pantallas ni endpoints
-- que usen estas tablas. Se conserva para que el esquema y la base no
-- diverjan; la funcionalidad completa queda pendiente.
--
-- No borra ni transforma datos existentes: crea tipos y tablas nuevas y agrega
-- columnas con valor por defecto.

-- CreateEnum
CREATE TYPE "ComplaintMotive" AS ENUM ('HOSTIGAMIENTO', 'HORARIO', 'LENGUAJE', 'FRECUENCIA', 'DATOS_PERSONALES', 'MONTO', 'OTRO');

-- CreateEnum
CREATE TYPE "ComplaintChannel" AS ENUM ('WHATSAPP', 'LLAMADA', 'CORREO', 'PRESENCIAL', 'OTRO');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('ABIERTA', 'EN_PROCESO', 'CERRADA', 'ESCALADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LogModule" ADD VALUE 'COMPLAINT';
ALTER TYPE "LogModule" ADD VALUE 'COMPLIANCE';

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "authorizedScheduleEnd" TEXT NOT NULL DEFAULT '21:00',
ADD COLUMN     "authorizedScheduleStart" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "rfc" TEXT,
ADD COLUMN     "taxRegime" TEXT;

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "motive" "ComplaintMotive" NOT NULL,
    "channel" "ComplaintChannel" NOT NULL,
    "description" TEXT NOT NULL,
    "resolution" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'ABIERTA',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "escalatedTo" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorizedContactMethod" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channel" "ComplaintChannel" NOT NULL,
    "identifier" TEXT NOT NULL,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorizedContactMethod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Complaint_workspaceId_openedAt_idx" ON "Complaint"("workspaceId", "openedAt");

-- CreateIndex
CREATE INDEX "Complaint_workspaceId_status_idx" ON "Complaint"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Complaint_contactId_idx" ON "Complaint"("contactId");

-- CreateIndex
CREATE INDEX "Complaint_conversationId_idx" ON "Complaint"("conversationId");

-- CreateIndex
CREATE INDEX "AuthorizedContactMethod_workspaceId_active_idx" ON "AuthorizedContactMethod"("workspaceId", "active");

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorizedContactMethod" ADD CONSTRAINT "AuthorizedContactMethod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
