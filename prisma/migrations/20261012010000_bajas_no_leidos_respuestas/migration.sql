-- Consentimiento (opt-in), bajas (STOP), no leídos, notas internas,
-- respuestas rápidas y contador diario de mensajes manuales.
--
-- Todo es aditivo salvo la eliminación de "User"."manualMessagesUsed": ese
-- contador era acumulativo y no se reiniciaba, así que se sustituye por un
-- cálculo sobre los mensajes enviados desde la medianoche local.

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "skippedRecipients" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "optInAt" TIMESTAMP(3),
ADD COLUMN     "optOutAt" TIMESTAMP(3),
ADD COLUMN     "optOutSource" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "unreadCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "isInternalNote" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "manualMessagesUsed";

-- CreateTable
CREATE TABLE "QuickReply" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuickReply_workspaceId_idx" ON "QuickReply"("workspaceId");

-- CreateIndex
CREATE INDEX "QuickReply_isActive_idx" ON "QuickReply"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "QuickReply_workspaceId_title_key" ON "QuickReply"("workspaceId", "title");

-- CreateIndex
CREATE INDEX "Contact_optOutAt_idx" ON "Contact"("optOutAt");

-- CreateIndex
CREATE INDEX "Message_sentByUserId_createdAt_idx" ON "Message"("sentByUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "QuickReply" ADD CONSTRAINT "QuickReply_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickReply" ADD CONSTRAINT "QuickReply_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Datos: las notas internas que ya existían se distinguen de un envío real
-- porque nunca salieron del panel (se quedaron en estado CREATED) y no
-- deben contar para el límite diario de mensajes manuales.
UPDATE "Message"
   SET "isInternalNote" = true
 WHERE "source" = 'MANUAL'
   AND "status" = 'CREATED'
   AND "sentByUserId" IS NOT NULL;
