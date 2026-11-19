ALTER TABLE "GuidedFlow" ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GuidedFlowRun" ADD COLUMN "pendingStepId" TEXT;
