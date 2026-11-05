import { AiMode, LogLevel, LogModule } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { nowInAppTimezone, startOfMonthIn } from "../utils/date";
import { LogService } from "./log.service";

export type AiUsageState =
    | "OK"
    | "LIMIT_REACHED"
    | "OVERAGE"
    | "HARD_CAP_REACHED";

export type CurrentAiUsage = {
    replyCount: number;
    suggestCount: number;
    limit: number;
    overage: number;
    overageCost: number;
    hardCap: number;
    spentCents: number;
    enforce: boolean;
    hidden: boolean;
    state: AiUsageState;
};

export type MonthlyAiUsageRow = {
    year: number;
    month: number;
    replyCount: number;
    suggestCount: number;
    limit: number;
    overage: number;
    overageCost: number;
};

const MICROS_PER_CENT = 10_000;

/** Año y mes en la zona del workspace, sin depender de la zona del servidor. */
export function monthKeyIn(timezone: string, now = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit"
    }).formatToParts(now);

    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);

    return { year, month };
}

function overageFor(replyCount: number, limit: number) {
    return limit > 0 ? Math.max(0, replyCount - limit) : 0;
}

function overageCostFor(overage: number) {
    if (overage <= 0) {
        return 0;
    }

    const price = appConfig.aiOveragePriceMxn;

    return Math.round(((overage * price) / 1000) * 100) / 100;
}

/**
 * Contador mensual de IA por workspace.
 *
 * El mes se calcula en la zona del workspace (no en UTC) y se guarda en
 * `AiUsageMonthly` para no sumar toda la tabla de mensajes en cada vista.
 * Los límites y el hard cap son configuración del operador (Railway).
 */
export class AiUsageService {
    static async incrementAutoReply(workspaceId: string, timezone: string) {
        const { year, month } = monthKeyIn(timezone);

        const row = await prisma.aiUsageMonthly.upsert({
            where: {
                workspaceId_year_month: { workspaceId, year, month }
            },
            create: { workspaceId, year, month, replyCount: 1 },
            update: {
                replyCount: { increment: 1 },
                lastIncrementedAt: new Date()
            }
        });

        const usage = await this.getCurrentMonthUsage(workspaceId, timezone);

        await this.auditThresholds(workspaceId, timezone, usage, {
            isNewReply: row.replyCount,
            limit: usage.limit
        });

        return usage;
    }

    static async incrementSuggest(workspaceId: string, timezone: string) {
        const { year, month } = monthKeyIn(timezone);

        await prisma.aiUsageMonthly.upsert({
            where: {
                workspaceId_year_month: { workspaceId, year, month }
            },
            create: { workspaceId, year, month, suggestCount: 1 },
            update: {
                suggestCount: { increment: 1 },
                lastIncrementedAt: new Date()
            }
        });

        return this.getCurrentMonthUsage(workspaceId, timezone);
    }

    static async getCurrentMonthUsage(
        workspaceId: string,
        timezone: string
    ): Promise<CurrentAiUsage> {
        const { year, month } = monthKeyIn(timezone);
        const monthStart = startOfMonthIn(timezone);

        const [row, spent] = await Promise.all([
            prisma.aiUsageMonthly.findUnique({
                where: {
                    workspaceId_year_month: { workspaceId, year, month }
                }
            }),
            prisma.aiUsage.aggregate({
                where: { workspaceId, createdAt: { gte: monthStart } },
                _sum: { costMicros: true }
            })
        ]);

        const replyCount = row?.replyCount ?? 0;
        const suggestCount = row?.suggestCount ?? 0;
        const limit = appConfig.aiMonthlyRepliesLimit;
        const hardCap = appConfig.aiMonthlyBudgetCents;
        const spentCents = Math.ceil((spent._sum.costMicros ?? 0) / MICROS_PER_CENT);
        const overage = overageFor(replyCount, limit);
        const enforce = appConfig.aiLimitsEnforce;
        const hardCapReached = enforce && hardCap > 0 && spentCents >= hardCap;

        const state: AiUsageState = hardCapReached
            ? "HARD_CAP_REACHED"
            : overage > 0
              ? "OVERAGE"
              : limit > 0 && replyCount >= limit
                ? "LIMIT_REACHED"
                : "OK";

        return {
            replyCount,
            suggestCount,
            limit,
            overage,
            overageCost: overageCostFor(overage),
            hardCap,
            spentCents,
            enforce,
            hidden: appConfig.aiLimitsHidden,
            state
        };
    }

    static async getMonthlyReport(
        workspaceId: string,
        months = 12
    ): Promise<MonthlyAiUsageRow[]> {
        const current = nowInAppTimezone();
        const keys: Array<{ year: number; month: number }> = [];

        for (let index = 0; index < months; index += 1) {
            const point = current.subtract(index, "month");
            keys.push({ year: point.year(), month: point.month() + 1 });
        }

        const rows = await prisma.aiUsageMonthly.findMany({
            where: {
                workspaceId,
                OR: keys.map((key) => ({ year: key.year, month: key.month }))
            }
        });

        const byKey = new Map(
            rows.map((row) => [row.year + "-" + row.month, row])
        );
        const limit = appConfig.aiMonthlyRepliesLimit;

        return keys.map((key) => {
            const row = byKey.get(key.year + "-" + key.month);
            const replyCount = row?.replyCount ?? 0;
            const overage = overageFor(replyCount, limit);

            return {
                year: key.year,
                month: key.month,
                replyCount,
                suggestCount: row?.suggestCount ?? 0,
                limit,
                overage,
                overageCost: overageCostFor(overage)
            };
        });
    }

    static async shouldHardCap(workspaceId: string): Promise<boolean> {
        if (!appConfig.aiLimitsEnforce || appConfig.aiMonthlyBudgetCents <= 0) {
            return false;
        }

        const timezone = await this.timezoneFor(workspaceId);
        const usage = await this.getCurrentMonthUsage(workspaceId, timezone);

        return usage.state === "HARD_CAP_REACHED";
    }

    private static async timezoneFor(workspaceId: string): Promise<string> {
        const settings = await prisma.workspaceSettings.findUnique({
            where: { workspaceId },
            select: { timezone: true }
        });

        return settings?.timezone || appConfig.timezone;
    }

    private static async auditThresholds(
        workspaceId: string,
        timezone: string,
        usage: CurrentAiUsage,
        context: { isNewReply: number; limit: number }
    ) {
        const monthStart = startOfMonthIn(timezone);

        /** Aviso único al tocar exactamente el límite incluido. */
        if (usage.limit > 0 && usage.replyCount === usage.limit) {
            await this.logOnce(
                workspaceId,
                monthStart,
                "AI_USAGE_LIMIT_REACHED",
                LogLevel.WARN,
                "Se alcanzó el límite mensual de respuestas de IA incluidas.",
                { replyCount: usage.replyCount, limit: usage.limit }
            );
        }

        /** Aviso único al empezar el excedente (primer reply por encima). */
        if (
            usage.limit > 0 &&
            usage.replyCount === usage.limit + 1
        ) {
            await this.logOnce(
                workspaceId,
                monthStart,
                "AI_OVERAGE_STARTED",
                LogLevel.WARN,
                "La cuenta empezó a consumir respuestas de IA en excedente.",
                { replyCount: usage.replyCount, overage: usage.overage }
            );
        }

        if (usage.state === "HARD_CAP_REACHED") {
            const created = await this.logOnce(
                workspaceId,
                monthStart,
                "AI_HARD_CAP_REACHED",
                LogLevel.ERROR,
                "Se alcanzó el hard cap mensual de IA; el modo automático se apaga.",
                { spentCents: usage.spentCents, hardCap: usage.hardCap }
            );

            if (created) {
                await prisma.aiSettings.upsert({
                    where: { workspaceId },
                    create: { workspaceId, mode: AiMode.OFF },
                    update: { mode: AiMode.OFF }
                });
            }
        }
    }

    private static async logOnce(
        workspaceId: string,
        monthStart: Date,
        action: string,
        level: LogLevel,
        message: string,
        payload: Record<string, unknown>
    ): Promise<boolean> {
        const existing = await prisma.log.findFirst({
            where: {
                workspaceId,
                action,
                createdAt: { gte: monthStart }
            },
            select: { id: true }
        });

        if (existing) {
            return false;
        }

        await LogService.create({
            workspaceId,
            level,
            module: LogModule.AI,
            action,
            message,
            payload
        }).catch(() => undefined);

        return true;
    }
}