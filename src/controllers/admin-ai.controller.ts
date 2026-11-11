import { Request, Response } from "express";
import {
    LogLevel,
    LogModule,
    MessageDirection,
    MessageSource
} from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { aiProviderLabel, isProviderConfigured } from "../services/ai/provider";
import { AiSettingsService } from "../services/ai/settings.service";
import { AiUsageService } from "../services/aiUsage.service";
import { KnowledgeService } from "../services/ai/knowledge";
import { parseKnowledgeButtons } from "../services/ai/knowledge-buttons";
import { AiSuggestionService } from "../services/ai/suggestion.service";
import { LogService } from "../services/log.service";
import { SendPolicyService } from "../services/send-policy.service";
import { getRequiredParam } from "../utils/request";
import { InteractiveButton } from "../utils/interactive-message";
import { startOfMonthIn, startOfTodayIn } from "../utils/date";
import {
    aiSettingsSchema,
    aiTestSchema,
    createKnowledgeEntrySchema,
    splitKeywords,
    updateKnowledgeEntrySchema
} from "../validations/ai.validation";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => String(item));
    }

    return typeof value === "string" ? [value] : [];
}

const EMPTY_STATS = {
    total: 0,
    pending: 0,
    accepted: 0,
    edited: 0,
    discarded: 0,
    acceptanceRate: null as number | null,
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    superseded: 0,
    autoSent: 0,
    handoffs: 0,
    costMicros: 0
};

export class AdminAiController {
    private static async loadIndexData(req: Request) {
        const workspaceId = req.user!.workspaceId;

        try {
            const timezone = await SendPolicyService.timezoneFor(workspaceId);

            const [
                settings,
                entries,
                stats,
                monthlyRepliesUsed,
                suggestionsToday,
                aiUsage,
                aiUsageReport
            ] = await Promise.all([
                    AiSettingsService.get(workspaceId),
                    KnowledgeService.list(workspaceId),
                    AiSuggestionService.stats(
                        workspaceId,
                        new Date(Date.now() - THIRTY_DAYS_MS)
                    ),
                    prisma.message.count({
                        where: {
                            workspaceId,
                            direction: MessageDirection.OUT,
                            source: MessageSource.AUTOMATIC,
                            aiSuggestionId: { not: null },
                            createdAt: { gte: startOfMonthIn(timezone) }
                        }
                    }),
                    prisma.aiSuggestion.count({
                        where: {
                            workspaceId,
                            createdAt: { gte: startOfTodayIn(timezone) }
                        }
                    }),
                    AiUsageService.getCurrentMonthUsage(workspaceId, timezone),
                    AiUsageService.getMonthlyReport(workspaceId, 12)
                ]);

            return {
                settings,
                entries,
                stats,
                monthlyRepliesUsed,
                suggestionsToday,
                aiUsage,
                aiUsageReport,
                aiMaxSuggestionsPerDay: appConfig.aiMaxSuggestionsPerDay,
                providerLabel: aiProviderLabel(),
                providerReady: isProviderConfigured(),
                globalEnabled: appConfig.ai.enabled,
                defaultModel: appConfig.ai.model,
                schemaReady: true
            };
        } catch {
            /**
             * Si la migración de IA todavía no se aplicó, la pantalla debe
             * abrir igual y decirlo, no tumbar el panel de administración.
             */
            return {
                settings: AiSettingsService.defaults(),
                entries: [],
                stats: EMPTY_STATS,
                monthlyRepliesUsed: 0,
                suggestionsToday: 0,
                aiUsage: null,
                aiUsageReport: [],
                aiMaxSuggestionsPerDay: appConfig.aiMaxSuggestionsPerDay,
                providerLabel: aiProviderLabel(),
                providerReady: isProviderConfigured(),
                globalEnabled: appConfig.ai.enabled,
                defaultModel: appConfig.ai.model,
                schemaReady: false
            };
        }
    }

    static async index(req: Request, res: Response) {
        /** Se nombra la clase a propósito: Express llama al handler sin `this`. */
        const data = await AdminAiController.loadIndexData(req);

        const workspace = await prisma.workspace.findUnique({
            where: { id: req.user!.workspaceId },
            select: { aiMultilangLanguages: true }
        });

        return res.render("pages/admin/ai/index", {
            user: req.user,
            multilangLanguages: workspace?.aiMultilangLanguages ?? [],
            aiLimitsHidden: appConfig.aiLimitsHidden,
            ...data,
            success: req.query.success || null,
            error: req.query.error || null,
            testQuestion: "",
            testResult: null,
            testError: null
        });
    }

    /** Idiomas de respuesta de la IA: español siempre; inglés/portugués opt-in. */
    static async resetSettings(req: Request, res: Response) {
        try {
            await AiSettingsService.reset(
                req.user!.workspaceId,
                req.user!.id
            );
            return res.redirect("/admin/ai?success=reset");
        } catch {
            return res.redirect("/admin/ai?error=settings");
        }
    }

    static async saveLanguages(req: Request, res: Response) {
        const languages: string[] = [];

        if (req.body?.english === "true") {
            languages.push("en");
        }

        if (req.body?.portuguese === "true") {
            languages.push("pt");
        }

        await prisma.workspace.update({
            where: { id: req.user!.workspaceId },
            data: { aiMultilangLanguages: languages }
        });

        return res.redirect("/admin/ai?success=languages");
    }

    static async saveSettings(req: Request, res: Response) {
        const parsed = aiSettingsSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect("/admin/ai?error=validation");
        }

        try {
            await AiSettingsService.save(
                req.user!.workspaceId,
                req.user!.id,
                {
                    enabled: parsed.data.enabled,
                    mode: parsed.data.mode,
                    systemPrompt: parsed.data.systemPrompt,
                    tone: parsed.data.tone,
                    language: parsed.data.language,
                    confidenceMin: parsed.data.confidenceMin,
                    maxRepliesPerDay: parsed.data.maxRepliesPerDay,
                    maxRepliesPerThread: parsed.data.maxRepliesPerThread,
                    monthlyBudgetCents: parsed.data.monthlyBudgetCents,
                    handoffKeywords: splitKeywords(parsed.data.handoffKeywords),
                    model: parsed.data.model
                }
            );

            await LogService.create({
                workspaceId: req.user!.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.AI,
                action: "AI_SETTINGS_UPDATED",
                message: "Se actualizaron los ajustes de IA.",
                payload: {
                    enabled: parsed.data.enabled,
                    mode: parsed.data.mode,
                    confidenceMin: parsed.data.confidenceMin,
                    maxRepliesPerDay: parsed.data.maxRepliesPerDay,
                    maxRepliesPerThread: parsed.data.maxRepliesPerThread,
                    monthlyBudgetCents: parsed.data.monthlyBudgetCents,
                    model: parsed.data.model || null
                }
            });

            return res.redirect("/admin/ai?success=settings");
        } catch {
            return res.redirect("/admin/ai?error=settings");
        }
    }

    static async createEntry(req: Request, res: Response) {
        const parsed = createKnowledgeEntrySchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect("/admin/ai?error=validation");
        }

        let buttons: InteractiveButton[] | null;

        try {
            buttons = parseKnowledgeButtons(
                toStringArray(req.body?.buttonTitle)
            );
        } catch {
            return res.redirect("/admin/ai?error=buttons");
        }

        try {
            const entry = await KnowledgeService.create(
                req.user!.workspaceId,
                req.user!.id,
                {
                    question: parsed.data.question,
                    answer: parsed.data.answer,
                    buttons,
                    keywords: splitKeywords(parsed.data.keywords),
                    priority: parsed.data.priority
                }
            );

            await LogService.create({
                workspaceId: req.user!.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.AI,
                action: "AI_KNOWLEDGE_CREATED",
                message: "Se creó una entrada de la base de conocimiento.",
                payload: { entryId: entry.id }
            });

            return res.redirect("/admin/ai?success=knowledge");
        } catch {
            return res.redirect("/admin/ai?error=knowledge");
        }
    }

    static async showEditEntry(req: Request, res: Response) {
        const entryId = getRequiredParam(req, "id");

        try {
            const entry = await KnowledgeService.getById(
                req.user!.workspaceId,
                entryId
            );

            return res.render("pages/admin/ai/edit-entry", {
                user: req.user,
                entry,
                error: req.query.error || null
            });
        } catch {
            return res.redirect("/admin/ai?error=knowledge");
        }
    }

    static async updateEntry(req: Request, res: Response) {
        const entryId = getRequiredParam(req, "id");
        const parsed = updateKnowledgeEntrySchema.safeParse(req.body);

        if (!parsed.success) {
            const entry = await KnowledgeService.getById(
                req.user!.workspaceId,
                entryId
            ).catch(() => null);

            if (!entry) {
                return res.redirect("/admin/ai?error=knowledge");
            }

            return res.status(400).render("pages/admin/ai/edit-entry", {
                user: req.user,
                entry,
                error: parsed.error.issues[0]?.message || "Datos inválidos."
            });
        }

        let buttons: InteractiveButton[] | null;

        try {
            buttons = parseKnowledgeButtons(
                toStringArray(req.body?.buttonTitle)
            );
        } catch {
            return res.redirect(
                `/admin/ai/knowledge/${entryId}?error=buttons`
            );
        }

        try {
            await KnowledgeService.update(
                req.user!.workspaceId,
                entryId,
                {
                    question: parsed.data.question,
                    answer: parsed.data.answer,
                    buttons,
                    keywords: splitKeywords(parsed.data.keywords),
                    priority: parsed.data.priority
                }
            );

            await LogService.create({
                workspaceId: req.user!.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.AI,
                action: "AI_KNOWLEDGE_UPDATED",
                message: "Se actualizó una entrada de la base de conocimiento.",
                payload: { entryId }
            });

            return res.redirect("/admin/ai?success=knowledge");
        } catch {
            return res.redirect("/admin/ai?error=knowledge");
        }
    }

    static async setEntryActive(req: Request, res: Response) {
        const entryId = getRequiredParam(req, "id");
        const isActive = req.body?.isActive === "true";

        try {
            await KnowledgeService.setActive(
                req.user!.workspaceId,
                entryId,
                isActive
            );

            return res.redirect("/admin/ai?success=knowledge");
        } catch {
            return res.redirect("/admin/ai?error=knowledge");
        }
    }

    static async deleteEntry(req: Request, res: Response) {
        const entryId = getRequiredParam(req, "id");

        try {
            const entry = await KnowledgeService.getById(
                req.user!.workspaceId,
                entryId
            );

            if (!entry) {
                return res.redirect("/admin/ai?error=knowledge");
            }

            await KnowledgeService.remove(req.user!.workspaceId, entry.id);

            await LogService.create({
                workspaceId: req.user!.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.AI,
                action: "KNOWLEDGE_DELETED",
                message: "Se eliminó una entrada de la base de conocimiento.",
                payload: { entryId: entry.id }
            }).catch(() => undefined);

            return res.redirect("/admin/ai?success=knowledge_deleted");
        } catch {
            return res.redirect("/admin/ai?error=knowledge");
        }
    }

    static async test(req: Request, res: Response) {
        const parsed = aiTestSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect("/admin/ai?error=test");
        }

        /** Se nombra la clase a propósito: Express llama al handler sin `this`. */
        const data = await AdminAiController.loadIndexData(req);

        try {
            const testResult = await AiSuggestionService.preview({
                workspaceId: req.user!.workspaceId,
                question: parsed.data.question
            });

            return res.render("pages/admin/ai/index", {
                user: req.user,
                ...data,
                success: null,
                error: null,
                testQuestion: parsed.data.question,
                testResult,
                testError: null
            });
        } catch (error) {
            return res.status(400).render("pages/admin/ai/index", {
                user: req.user,
                ...data,
                success: null,
                error: null,
                testQuestion: parsed.data.question,
                testResult: null,
                testError:
                    error instanceof Error
                        ? error.message
                        : "No se pudo probar la IA."
            });
        }
    }
}
