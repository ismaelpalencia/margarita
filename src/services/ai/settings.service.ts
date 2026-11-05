import { AiMode } from "@prisma/client";

import { appConfig } from "../../config/app.config";
import { prisma } from "../../config/prisma";

export type ResolvedAiSettings = {
    enabled: boolean;
    mode: AiMode;
    systemPrompt: string | null;
    tone: string | null;
    language: string;
    confidenceMin: number;
    maxRepliesPerDay: number;
    maxRepliesPerThread: number;
    monthlyBudgetCents: number;
    /** Tope mensual del plan; null = sin tope. */
    monthlyRepliesLimit: number | null;
    handoffKeywords: string[];
    model: string | null;
    /** El techo lo puso el operador desde Railway: no se edita en el panel. */
    maxRepliesPerDayLocked: boolean;
    maxRepliesPerThreadLocked: boolean;
    monthlyBudgetLocked: boolean;
};

export type SaveAiSettingsInput = {
    enabled: boolean;
    mode: AiMode;
    systemPrompt: string;
    tone: string;
    language: string;
    confidenceMin: number;
    maxRepliesPerDay: number;
    maxRepliesPerThread: number;
    monthlyBudgetCents: number;
    handoffKeywords: string[];
    model: string;
};

function cap(value: number, limit: number | null): number {
    return limit === null ? value : Math.min(value, limit);
}

/**
 * Ajustes de IA por workspace.
 *
 * Si no existe fila, se devuelven los valores por defecto sin escribir en la
 * base: una instalación que nunca abrió la pantalla de IA no debe tener una
 * fila nueva solo por arrancar.
 *
 * El operador controla los límites desde Railway:
 * - `AI_MAX_REPLIES_PER_DAY` / `AI_MAX_REPLIES_PER_THREAD` recortan el valor.
 * - `AI_MAX_MONTHLY_BUDGET_CENTS` recorta el presupuesto de sugerencias/auto.
 * - `AI_LIMITS_LOCKED=true` deja los tres en solo lectura con su valor actual.
 * - `AI_LIMITS_HIDDEN=true` oculta la tarjeta entera al cliente.
 */
export class AiSettingsService {
    private static locks() {
        return {
            maxRepliesPerDayLocked:
                appConfig.aiLimitsLocked ||
                appConfig.aiMaxRepliesPerDay !== null,
            maxRepliesPerThreadLocked:
                appConfig.aiLimitsLocked ||
                appConfig.aiMaxRepliesPerThread !== null,
            monthlyBudgetLocked:
                appConfig.aiLimitsLocked ||
                appConfig.aiMaxMonthlyBudgetCents !== null
        };
    }

    static defaults(): ResolvedAiSettings {
        return {
            enabled: false,
            mode: AiMode.SUGGEST,
            systemPrompt: null,
            tone: null,
            language: "es-MX",
            confidenceMin: 0.7,
            maxRepliesPerDay: cap(50, appConfig.aiMaxRepliesPerDay),
            maxRepliesPerThread: cap(5, appConfig.aiMaxRepliesPerThread),
            monthlyBudgetCents: cap(500, appConfig.aiMaxMonthlyBudgetCents),
            monthlyRepliesLimit: appConfig.aiMonthlyRepliesLimit,
            handoffKeywords: [],
            model: null,
            ...this.locks()
        };
    }

    static async get(workspaceId: string): Promise<ResolvedAiSettings> {
        const row = await prisma.aiSettings.findUnique({
            where: { workspaceId }
        });

        if (!row) {
            return this.defaults();
        }

        return {
            enabled: row.enabled,
            mode: row.mode,
            systemPrompt: row.systemPrompt,
            tone: row.tone,
            language: row.language,
            confidenceMin: row.confidenceMin,
            maxRepliesPerDay: cap(row.maxRepliesPerDay, appConfig.aiMaxRepliesPerDay),
            maxRepliesPerThread: cap(
                row.maxRepliesPerThread,
                appConfig.aiMaxRepliesPerThread
            ),
            monthlyBudgetCents: cap(
                row.monthlyBudgetCents,
                appConfig.aiMaxMonthlyBudgetCents
            ),
            monthlyRepliesLimit: appConfig.aiMonthlyRepliesLimit,
            handoffKeywords: row.handoffKeywords,
            model: row.model,
            ...this.locks()
        };
    }

    static async save(
        workspaceId: string,
        userId: string,
        input: SaveAiSettingsInput
    ) {
        /**
         * Con la tarjeta oculta o bloqueada, los límites vigentes no se
         * tocan: aunque alguien postee el formulario a mano, se conserva
         * lo que ya estaba (y el techo de Railway se aplica igual).
         */
        const preserve = appConfig.aiLimitsHidden || appConfig.aiLimitsLocked;
        const current = preserve
            ? await prisma.aiSettings.findUnique({ where: { workspaceId } })
            : null;
        const fallback = this.defaults();

        const maxRepliesPerDay = preserve
            ? current?.maxRepliesPerDay ?? fallback.maxRepliesPerDay
            : input.maxRepliesPerDay;
        const maxRepliesPerThread = preserve
            ? current?.maxRepliesPerThread ?? fallback.maxRepliesPerThread
            : input.maxRepliesPerThread;
        const monthlyBudgetCents = preserve
            ? current?.monthlyBudgetCents ?? fallback.monthlyBudgetCents
            : input.monthlyBudgetCents;

        const data = {
            enabled: input.enabled,
            mode: input.mode,
            systemPrompt: input.systemPrompt || null,
            tone: input.tone || null,
            language: input.language,
            confidenceMin: input.confidenceMin,
            maxRepliesPerDay: cap(maxRepliesPerDay, appConfig.aiMaxRepliesPerDay),
            maxRepliesPerThread: cap(
                maxRepliesPerThread,
                appConfig.aiMaxRepliesPerThread
            ),
            monthlyBudgetCents: cap(
                monthlyBudgetCents,
                appConfig.aiMaxMonthlyBudgetCents
            ),
            handoffKeywords: input.handoffKeywords,
            model: input.model || null,
            updatedById: userId
        };

        return prisma.aiSettings.upsert({
            where: { workspaceId },
            create: { workspaceId, ...data },
            update: data
        });
    }
}