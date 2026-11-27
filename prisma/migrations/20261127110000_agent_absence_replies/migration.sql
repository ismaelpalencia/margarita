ALTER TABLE "Workspace"
    ADD COLUMN "agentAbsenceReplyEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "agentAbsenceReplyManualEnabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "agentAbsenceReplyMessage" TEXT,
    ADD COLUMN "agentAbsenceReplyIntervalHours" INTEGER NOT NULL DEFAULT 12;

ALTER TABLE "Conversation"
    ADD COLUMN "lastAgentAbsenceReplyAt" TIMESTAMP(3);
