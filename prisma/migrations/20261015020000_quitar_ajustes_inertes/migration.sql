-- Se quitan los ajustes del workspace que ningún código leía.
--
-- Prometían horarios de atención, mensaje fuera de horario, modo de
-- asignación, idioma y límites de conversaciones activas. No había pantalla
-- para editarlos ni efecto en el comportamiento: solo deuda.
--
-- Quedan `timezone` (fechas, topes diarios y reportes) y `maxManualMessages`
-- (tope diario de mensajes manuales por agente), que sí se usan.

-- AlterTable
ALTER TABLE "WorkspaceSettings"
DROP COLUMN "autoAssign",
DROP COLUMN "assignmentMode",
DROP COLUMN "businessHoursStart",
DROP COLUMN "businessHoursEnd",
DROP COLUMN "outOfHoursMessage",
DROP COLUMN "maxActiveConversations",
DROP COLUMN "reopenedConversationMode",
DROP COLUMN "language";

-- DropEnum
DROP TYPE "AssignmentMode";

-- DropEnum
DROP TYPE "ReopenedConversationMode";
