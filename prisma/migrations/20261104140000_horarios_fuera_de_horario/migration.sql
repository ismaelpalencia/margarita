-- Horarios de atención y respuesta fuera de horario.
--
-- Todo es aditivo y apagado por defecto: sin businessHoursEnabled la
-- instalación se comporta exactamente igual que antes. No se reescriben
-- filas ni se cambia el comportamiento de los datos existentes.

-- AlterEnum
CREATE TYPE "OffHoursMode" AS ENUM ('TEXT_ONLY', 'AI_IF_COVERED', 'QUEUE_ONLY');

-- AlterTable
ALTER TABLE "Workspace"
    ADD COLUMN "businessHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "businessHours" JSONB,
    ADD COLUMN "offHoursMode" "OffHoursMode" NOT NULL DEFAULT 'TEXT_ONLY',
    ADD COLUMN "offHoursMessage" TEXT,
    ADD COLUMN "offHoursReplyIntervalHours" INTEGER NOT NULL DEFAULT 12;

ALTER TABLE "Conversation"
    ADD COLUMN "lastOffHoursReplyAt" TIMESTAMP(3);
