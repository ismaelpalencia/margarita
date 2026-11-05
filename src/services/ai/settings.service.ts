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
    handoffKeywords: string[];
    model: string | null;
    /** El techo lo puso el operador desde Railway: no se edita en el panel. */
    maxRepliesPerDayLocked: boolean;
    maxRepliesPerThreadLocked: boolean;
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
 * Los topes `AI_MAX_REPLIES_PER_DAY`/`AI_MAX_REPLIES_PER_THREAD` de Railway
 * recortan siempre el valor efectivo: ni el cliente ni la base pueden
 * superarlos, y la pantalla los pinta como solo lectura.
 */
export class AiSettingsService {
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
            monthlyBudgetCents: 500,
            handoffKeywords: [],
            model: null,
            maxRepliesPerDayLocked: appConfig.aiMaxRepliesPerDay !== null,
            maxRepliesPerThreadLocked: appConfig.aiMaxRepliesPerThread !== null
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
            monthlyBudgetCents: row.monthlyBudgetCents,
            handoffKeywords: row.handoffKeywords,
            model: row.model,
            maxRepliesPerDayLocked: appConfig.aiMaxRepliesPerDay !== null,
            maxRepliesPerThreadLocked: appConfig.aiMaxRepliesPerThread !== null
        };
    }

    static async save(
        workspaceId: string,
        userId: string,
        input: SaveAiSettingsInput
    ) {
        const data = {
            enabled: input.enabled,
            mode: input.mode,
            systemPrompt: input.systemPrompt || null,
            tone: input.tone || null,
            language: input.language,
            confidenceMin: input.confidenceMin,
            maxRepliesPerDay: cap(input.maxRepliesPerDay, appConfig.aiMaxRepliesPerDay),
            maxRepliesPerThread: cap(
                input.maxRepliesPerThread,
                appConfig.aiMaxRepliesPerThread
            ),
            monthlyBudgetCents: input.monthlyBudgetCents,
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