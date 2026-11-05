-- Contador mensual de IA por workspace (aditivo).
CREATE TABLE "AiUsageMonthly" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "suggestCount" INTEGER NOT NULL DEFAULT 0,
    "lastIncrementedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsageMonthly_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiUsageMonthly_workspaceId_year_month_key" ON "AiUsageMonthly"("workspaceId", "year", "month");
CREATE INDEX "AiUsageMonthly_workspaceId_year_month_idx" ON "AiUsageMonthly"("workspaceId", "year", "month");

ALTER TABLE "AiUsageMonthly" ADD CONSTRAINT "AiUsageMonthly_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
