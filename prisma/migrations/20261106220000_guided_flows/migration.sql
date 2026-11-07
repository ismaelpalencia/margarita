-- Flujos guiados deterministas (aditivo).
CREATE TYPE "GuidedFlowRunStatus" AS ENUM ('ACTIVE', 'COMPLETED');

CREATE TABLE "GuidedFlow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuidedFlow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuidedFlowRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "currentStepId" TEXT NOT NULL,
    "status" "GuidedFlowRunStatus" NOT NULL DEFAULT 'ACTIVE',
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuidedFlowRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuidedFlow_workspaceId_slug_key" ON "GuidedFlow"("workspaceId", "slug");
CREATE INDEX "GuidedFlow_workspaceId_isActive_idx" ON "GuidedFlow"("workspaceId", "isActive");
CREATE UNIQUE INDEX "GuidedFlowRun_conversationId_key" ON "GuidedFlowRun"("conversationId");
CREATE INDEX "GuidedFlowRun_workspaceId_status_idx" ON "GuidedFlowRun"("workspaceId", "status");

ALTER TABLE "GuidedFlow" ADD CONSTRAINT "GuidedFlow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuidedFlowRun" ADD CONSTRAINT "GuidedFlowRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuidedFlowRun" ADD CONSTRAINT "GuidedFlowRun_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "GuidedFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuidedFlowRun" ADD CONSTRAINT "GuidedFlowRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
