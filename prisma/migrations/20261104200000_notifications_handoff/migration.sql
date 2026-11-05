-- Notificaciones en tiempo real y fallback de asignación de handoff.
-- Todo aditivo y apagado por defecto (notificaciones) o con valores seguros
-- (handoffEscalationMinutes=15, autoAssignToAdmin=true).

ALTER TABLE "User"
    ADD COLUMN "notifySoundEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "notifyBrowserEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Workspace"
    ADD COLUMN "handoffEscalationMinutes" INTEGER NOT NULL DEFAULT 15,
    ADD COLUMN "autoAssignToAdmin" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Conversation"
    ADD COLUMN "handoffEscalatedAt" TIMESTAMP(3);
