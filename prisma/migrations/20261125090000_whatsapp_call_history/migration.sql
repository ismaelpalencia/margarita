CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "agentId" TEXT,
    "metaCallId" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "error" TEXT,
    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Call_metaCallId_key" ON "Call"("metaCallId");
CREATE INDEX "Call_workspaceId_conversationId_startedAt_idx" ON "Call"("workspaceId", "conversationId", "startedAt");
CREATE INDEX "Call_agentId_status_idx" ON "Call"("agentId", "status");

ALTER TABLE "Call" ADD CONSTRAINT "Call_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Call" ADD CONSTRAINT "Call_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Call" ADD CONSTRAINT "Call_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
