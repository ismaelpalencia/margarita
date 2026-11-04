import { AiMode } from "@prisma/client";

import { prisma } from "../../config/prisma";

export type ResolvedAiSettings = {
    enabled: boolean;
    mode: AiMode;
    systemPrompt: string | null;
    tone: string | null;
    language: string;
    confidenceMin: number;
    maxRepliesPerDay: number;
    handoffKeywords: string[];
    model: string | null;
};

export type SaveAiSettingsInput = {
    enabled: boolean;
    mode: AiMode;
    systemPrompt: string;
    tone: string;
    language: string;
    confidenceMin: number;
    maxRepliesPerDay: number;
    handoffKeywords: string[];
    model: string;
};

/**
 * Ajustes de IA por workspace.
 *
 * Si no existe fila, se devuelven los valores por defecto sin escribir en la
 * base: una instalación que nunca abrió la pantalla de IA no debe tener una
 * fila nueva solo por arrancar.
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
            maxRepliesPerDay: 50,
            handoffKeywords: [],
            model: null
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
            maxRepliesPerDay: row.maxRepliesPerDay,
            handoffKeywords: row.handoffKeywords,
            model: row.model
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
            maxRepliesPerDay: input.maxRepliesPerDay,
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
