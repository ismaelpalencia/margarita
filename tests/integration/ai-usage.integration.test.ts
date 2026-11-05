import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { prisma } from "../../src/config/prisma";
import { AiUsageService } from "../../src/services/aiUsage.service";
import { appConfig } from "../../src/config/app.config";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    WorkspaceFixture
} from "./helpers";

let fixture: WorkspaceFixture;
const timezone = "America/Mexico_City";

before(async () => {
    fixture = await createWorkspaceFixture();
});

after(async () => {
    await cleanupWorkspace(fixture.workspaceId);
    await disconnectFixtures();
    await prisma.$disconnect();
});

test("el contador mensual suma respuestas y sugerencias", async () => {
    await AiUsageService.incrementAutoReply(fixture.workspaceId, timezone);
    await AiUsageService.incrementAutoReply(fixture.workspaceId, timezone);
    await AiUsageService.incrementSuggest(fixture.workspaceId, timezone);

    const usage = await AiUsageService.getCurrentMonthUsage(
        fixture.workspaceId,
        timezone
    );

    assert.equal(usage.replyCount, 2);
    assert.equal(usage.suggestCount, 1);
    assert.equal(usage.state, "OK");
    assert.equal(usage.overage, 0);
});

test("el reporte devuelve 12 meses con ceros donde no hay datos", async () => {
    const report = await AiUsageService.getMonthlyReport(fixture.workspaceId, 12);

    assert.equal(report.length, 12);
    assert.equal(report[0].replyCount, 2);

    const empty = report.slice(1);
    assert.equal(empty.every((row) => row.replyCount === 0), true);
    assert.equal(empty.every((row) => row.overageCost === 0), true);
});

test("el primer excedente avisa una sola vez", async () => {
    const previousLimit = appConfig.aiMonthlyRepliesLimit;
    appConfig.aiMonthlyRepliesLimit = 2;

    await prisma.aiUsageMonthly.deleteMany({
        where: { workspaceId: fixture.workspaceId }
    });

    await AiUsageService.incrementAutoReply(fixture.workspaceId, timezone);
    await AiUsageService.incrementAutoReply(fixture.workspaceId, timezone);
    await AiUsageService.incrementAutoReply(fixture.workspaceId, timezone);
    await AiUsageService.incrementAutoReply(fixture.workspaceId, timezone);

    const logs = await prisma.log.findMany({
        where: {
            workspaceId: fixture.workspaceId,
            action: "AI_OVERAGE_STARTED"
        }
    });

    assert.equal(logs.length, 1);
    appConfig.aiMonthlyRepliesLimit = previousLimit;
});

test("el hard cap apaga el modo automático y avisa una vez", async () => {
    const previousEnforce = appConfig.aiLimitsEnforce;
    const previousBudget = appConfig.aiMonthlyBudgetCents;
    appConfig.aiLimitsEnforce = true;
    appConfig.aiMonthlyBudgetCents = 1;

    await prisma.aiUsageMonthly.deleteMany({
        where: { workspaceId: fixture.workspaceId }
    });
    await prisma.aiUsage.create({
        data: {
            workspaceId: fixture.workspaceId,
            model: "deepseek-chat",
            costMicros: 100_000
        }
    });
    await prisma.aiSettings.upsert({
        where: { workspaceId: fixture.workspaceId },
        create: { workspaceId: fixture.workspaceId, mode: "AUTO" },
        update: { mode: "AUTO" }
    });

    const usage = await AiUsageService.incrementAutoReply(
        fixture.workspaceId,
        timezone
    );

    assert.equal(usage.state, "HARD_CAP_REACHED");

    const settings = await prisma.aiSettings.findUniqueOrThrow({
        where: { workspaceId: fixture.workspaceId }
    });
    assert.equal(settings.mode, "OFF");

    const logs = await prisma.log.findMany({
        where: {
            workspaceId: fixture.workspaceId,
            action: "AI_HARD_CAP_REACHED"
        }
    });
    assert.equal(logs.length, 1);

    appConfig.aiLimitsEnforce = previousEnforce;
    appConfig.aiMonthlyBudgetCents = previousBudget;
});
