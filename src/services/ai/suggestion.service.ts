import {
    AiMode,
    AiSuggestionStatus,
    LogLevel,
    LogModule,
    MessageDirection,
    MessageSource
} from "@prisma/client";

import { appConfig } from "../../config/app.config";
import { prisma } from "../../config/prisma";
import { LogService } from "../log.service";
import { MessageService } from "../message.service";
import { AiAutoReplyService } from "./auto-reply.service";
import {
    decideAutoReply,
    decideGeneration,
    suggestionSkipLabel,
    SuggestionSkipReason
} from "./decision";
import { KnowledgeService } from "./knowledge";
import {
    buildContextMessages,
    buildIncomingMessage,
    buildSystemPrompt,
    parseModelOutput,
    ParsedAiReply
} from "./prompt";
import { estimateCostMicros } from "./pricing";
import {
    detectLanguage,
    LANGUAGE_LABELS,
    resolveReplyLanguage
} from "../../utils/language";
import { createAiProvider, isProviderConfigured } from "./provider";
import { AiSettingsService } from "./settings.service";
import { AiUsageService } from "../aiUsage.service";
import { SendPolicyService } from "../send-policy.service";
import { startOfTodayIn } from "../../utils/date";

/** El trabajo no debe generar respuesta. No es un error: es una decisión. */
export class SuggestionSkip extends Error {
    readonly reason: SuggestionSkipReason;

    constructor(reason: SuggestionSkipReason) {
        super(suggestionSkipLabel(reason));
        this.name = "SuggestionSkip";
        this.reason = reason;
    }
}

export type SuggestionStats = {
    total: number;
    pending: number;
    accepted: number;
    edited: number;
    discarded: number;
    /** Borradores que un mensaje más nuevo dejó sin efecto. */
    superseded: number;
    /** Respuestas que la IA envió sola (modo automático acotado). */
    autoSent: number;
    /** Conversaciones que la IA entregó a una persona. */
    handoffs: number;
    /** Costo estimado de las llamadas del periodo, en micro-USD. */
    costMicros: number;
    /** (aceptadas + editadas) / (aceptadas + editadas + descartadas). */
    acceptanceRate: number | null;
    calls: number;
    promptTokens: number;
    completionTokens: number;
};

/**
 * Lo que pasó con la IA en un hilo concreto.
 *
 * Es la vista corta que se enseña dentro de la conversación: cuántas veces
 * respondió sola, cuántas entregó a una persona y cuánto costó. El detalle
 * completo, con la base de conocimiento y los ajustes, sigue en Admin → IA.
 */
export type ConversationAiSummary = {
    total: number;
    pending: number;
    accepted: number;
    edited: number;
    discarded: number;
    superseded: number;
    autoSent: number;
    handoffs: number;
    costMicros: number;
    last: {
        status: AiSuggestionStatus;
        intent: string | null;
        confidence: number;
        handoff: boolean;
        reason: string | null;
        createdAt: Date;
    } | null;
};

export class AiSuggestionService {
    /**
     * Genera la respuesta de un trabajo encolado: borrador en `SUGGEST` o
     * candidato que se envía/entrega solo en `AUTO`.
     *
     * Lanza `SuggestionSkip` cuando la política dice que no se debe
     * responder; el worker lo registra como omitido, no como fallo.
     */
    static async generateForJob(jobId: string) {
        const job = await prisma.aiSuggestionJob.findUnique({
            where: { id: jobId },
            include: {
                workspace: true,
                conversation: {
                    include: {
                        contact: true
                    }
                }
            }
        });

        if (!job) {
            throw new Error("Trabajo de IA no encontrado.");
        }

        const inbound = await prisma.message.findUnique({
            where: { id: job.inboundMessageId }
        });

        if (!inbound) {
            throw new SuggestionSkip("MESSAGE_DELETED");
        }

        const settings = await AiSettingsService.get(job.workspaceId);
        const timezone = await SendPolicyService.timezoneFor(job.workspaceId);

        /** Tope diario de sugerencias: protege el costo de tokens. */
        if (appConfig.aiMaxSuggestionsPerDay !== null) {
            const suggestionsToday = await prisma.aiSuggestion.count({
                where: {
                    workspaceId: job.workspaceId,
                    createdAt: { gte: startOfTodayIn(timezone) }
                }
            });

            if (suggestionsToday >= appConfig.aiMaxSuggestionsPerDay) {
                throw new SuggestionSkip("SUGGESTION_LIMIT");
            }
        }

        const [newerInbound, humanReply] = await Promise.all([
            prisma.message.findFirst({
                where: {
                    conversationId: job.conversationId,
                    direction: MessageDirection.IN,
                    createdAt: { gt: inbound.createdAt }
                },
                orderBy: { createdAt: "asc" },
                select: { id: true }
            }),
            prisma.message.findFirst({
                where: {
                    conversationId: job.conversationId,
                    direction: MessageDirection.OUT,
                    source: MessageSource.MANUAL,
                    createdAt: { gt: inbound.createdAt }
                },
                orderBy: { createdAt: "asc" },
                select: { id: true }
            })
        ]);

        const decision = decideGeneration({
            globalEnabled: appConfig.ai.enabled,
            settings: {
                enabled: settings.enabled,
                mode: settings.mode
            },
            contact: {
                optOutAt: job.conversation.contact.optOutAt,
                pausedAt: job.conversation.contact.pausedAt
            },
            conversation: {
                status: job.conversation.status,
                lastIncomingMessageAt: job.conversation.lastIncomingMessageAt,
                aiPausedAt: job.conversation.aiPausedAt
            },
            message: {
                direction: inbound.direction,
                body: inbound.body,
                replyTitle: inbound.replyTitle,
                deletedAt: inbound.deletedAt,
                createdAt: inbound.createdAt
            },
            newerInboundExists: Boolean(newerInbound),
            humanRepliedAfter: Boolean(humanReply),
            now: new Date()
        });

        if (!decision.generate) {
            throw new SuggestionSkip(decision.reason);
        }

        if (!isProviderConfigured()) {
            throw new Error(
                "La IA no tiene proveedor configurado. Revisa AI_API_KEY."
            );
        }

        const knowledge = await KnowledgeService.rank(
            job.workspaceId,
            decision.text,
            appConfig.ai.maxKnowledgeEntries
        );

        const previousMessages = await prisma.message.findMany({
            where: {
                conversationId: job.conversationId,
                createdAt: { lt: inbound.createdAt },
                deletedAt: null,
                isInternalNote: false
            },
            orderBy: { createdAt: "desc" },
            take: appConfig.ai.maxContextMessages,
            select: {
                direction: true,
                body: true,
                createdAt: true
            }
        });

        /** Multilingüe: si el idioma detectado está habilitado, responde en él. */
        const enabledLanguages = job.workspace.aiMultilangLanguages || [];
        const detectedLanguage = detectLanguage(decision.text);
        const replyLanguage = resolveReplyLanguage(
            enabledLanguages,
            detectedLanguage
        );

        const system = buildSystemPrompt({
            workspaceName: job.workspace.name,
            settings,
            knowledge: knowledge.map((entry) => ({
                question: entry.question,
                answer: entry.answer
            })),
            replyLanguage: LANGUAGE_LABELS[replyLanguage]
        });

        const messages = [
            ...buildContextMessages(previousMessages.reverse()),
            buildIncomingMessage(decision.text)
        ];

        const provider = createAiProvider();
        const completion = await provider.complete({
            system,
            messages,
            maxTokens: appConfig.ai.maxTokens,
            temperature: appConfig.ai.temperature,
            model: settings.model || undefined
        });

        const parsed = parseModelOutput(completion.text);

        const suggestion = await prisma.aiSuggestion.upsert({
            where: { inboundMessageId: inbound.id },
            create: {
                workspaceId: job.workspaceId,
                conversationId: job.conversationId,
                inboundMessageId: inbound.id,
                body: parsed.reply,
                confidence: parsed.confidence,
                intent: parsed.intent,
                handoff: parsed.handoff,
                reason: parsed.reason,
                model: completion.model,
                status: AiSuggestionStatus.PENDING
            },
            update: {
                body: parsed.reply,
                confidence: parsed.confidence,
                intent: parsed.intent,
                handoff: parsed.handoff,
                reason: parsed.reason,
                model: completion.model
            }
        });

        /**
         * Los borradores anteriores de este hilo dejan de aplicar: la
         * conversación ya avanzó. No se borran (quedan auditados) y no
         * cuentan contra la tasa de aceptación.
         */
        await prisma.aiSuggestion.updateMany({
            where: {
                workspaceId: job.workspaceId,
                conversationId: job.conversationId,
                status: AiSuggestionStatus.PENDING,
                inboundMessageId: { not: inbound.id }
            },
            data: {
                status: AiSuggestionStatus.SUPERSEDED,
                decidedAt: new Date()
            }
        });

        await prisma.aiUsage.create({
            data: {
                workspaceId: job.workspaceId,
                conversationId: job.conversationId,
                suggestionId: suggestion.id,
                model: completion.model,
                promptTokens: completion.promptTokens,
                completionTokens: completion.completionTokens,
                latencyMs: completion.latencyMs,
                costMicros: estimateCostMicros({
                    model: completion.model,
                    promptTokens: completion.promptTokens,
                    completionTokens: completion.completionTokens
                })
            }
        });

        const automatic = settings.mode === AiMode.AUTO;

        await LogService.create({
            workspaceId: job.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.AI,
            action: automatic
                ? "AI_AUTO_CANDIDATE_CREATED"
                : "AI_SUGGESTION_CREATED",
            message: automatic
                ? "La IA preparó una respuesta para el modo automático."
                : "La IA generó un borrador de respuesta.",
            payload: {
                suggestionId: suggestion.id,
                conversationId: job.conversationId,
                inboundMessageId: inbound.id,
                model: completion.model,
                confidence: parsed.confidence,
                handoff: parsed.handoff,
                intent: parsed.intent,
                latencyMs: completion.latencyMs
            }
        });

        if (enabledLanguages.length > 0) {
            await LogService.create({
                workspaceId: job.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.AI,
                action: "AI_MULTILANG_REPLY",
                message: "La IA respondió en el idioma detectado del cliente.",
                payload: {
                    suggestionId: suggestion.id,
                    conversationId: job.conversationId,
                    detectedLanguage,
                    replyLanguage,
                    model: completion.model
                }
            }).catch(() => undefined);
        }

        if (!automatic) {
            /** Contador mensual de borradores de sugerencia. */
            await AiUsageService.incrementSuggest(job.workspaceId, timezone).catch(
                () => undefined
            );
        }

        if (automatic) {
            await this.processAutoReply({
                workspaceId: job.workspaceId,
                conversationId: job.conversationId,
                inboundCreatedAt: inbound.createdAt,
                suggestion,
                parsed,
                knowledgeUsed: knowledge.length,
                settings
            });
        }

        return suggestion;
    }

    /**
     * Segunda mitad del modo automático: aplicar la política con datos
     * frescos y, según el resultado, enviar o entregar a una persona.
     *
     * Un fallo de Meta no se reintenta a ciegas: se convierte en handoff,
     * porque el cliente ya espera y la persona puede responder.
     */
    private static async processAutoReply(params: {
        workspaceId: string;
        conversationId: string;
        inboundCreatedAt: Date;
        suggestion: { id: string; body: string; confidence: number; handoff: boolean; model: string };
        parsed: ParsedAiReply;
        knowledgeUsed: number;
        settings: Awaited<ReturnType<typeof AiSettingsService.get>>;
    }) {
        const [conversation, humanReply, counters] = await Promise.all([
            prisma.conversation.findFirst({
                where: {
                    id: params.conversationId,
                    workspaceId: params.workspaceId
                },
                include: { contact: true }
            }),
            prisma.message.findFirst({
                where: {
                    conversationId: params.conversationId,
                    direction: MessageDirection.OUT,
                    source: MessageSource.MANUAL,
                    createdAt: { gt: params.inboundCreatedAt }
                },
                select: { id: true }
            }),
            AiAutoReplyService.countersFor({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId
            })
        ]);

        if (!conversation) {
            return;
        }

        const timezone = await SendPolicyService.timezoneFor(params.workspaceId);
        const usageBefore = await AiUsageService.getCurrentMonthUsage(
            params.workspaceId,
            timezone
        );

        /** Con el hard cap agotado no se envía: se entrega a una persona. */
        if (
            appConfig.aiLimitsEnforce &&
            usageBefore.state === "HARD_CAP_REACHED"
        ) {
            await AiAutoReplyService.handoff({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                reason: "HARD_CAP",
                pause: false
            });

            return;
        }

        const decision = decideAutoReply({
            settings: {
                mode: params.settings.mode,
                confidenceMin: params.settings.confidenceMin,
                maxRepliesPerDay: params.settings.maxRepliesPerDay,
                maxRepliesPerThread: params.settings.maxRepliesPerThread,
                monthlyBudgetCents: params.settings.monthlyBudgetCents,
                monthlyRepliesLimit: params.settings.monthlyRepliesLimit
            },
            contact: {
                optOutAt: conversation.contact.optOutAt,
                pausedAt: conversation.contact.pausedAt
            },
            conversation: {
                status: conversation.status,
                lastIncomingMessageAt: conversation.lastIncomingMessageAt,
                aiPausedAt: conversation.aiPausedAt
            },
            humanRepliedAfter: Boolean(humanReply),
            reply: {
                body: params.parsed.reply,
                confidence: params.parsed.confidence,
                handoff: params.parsed.handoff
            },
            knowledgeEntriesUsed: params.knowledgeUsed,
            usage: counters,
            now: new Date()
        });

        if (!decision.send) {
            await this.registerAutoSkip({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                suggestionId: params.suggestion.id,
                reason: decision.reason
            });

            return;
        }

        try {
            const message = await MessageService.sendAutomaticReply({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                body: decision.text,
                aiSuggestionId: params.suggestion.id,
                aiModel: params.suggestion.model
            });

            const usageAfter = await AiUsageService.getCurrentMonthUsage(
                params.workspaceId,
                timezone
            );

            if (usageAfter.state === "HARD_CAP_REACHED") {
                await AiAutoReplyService.handoff({
                    workspaceId: params.workspaceId,
                    conversationId: params.conversationId,
                    reason: "HARD_CAP",
                    pause: false
                });
            }

            await prisma.aiSuggestion.update({
                where: { id: params.suggestion.id },
                data: {
                    status: AiSuggestionStatus.AUTO_SENT,
                    decidedAt: new Date()
                }
            });

            await LogService.create({
                workspaceId: params.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.AI,
                action: "AI_AUTO_REPLY_COMPLETED",
                message: "La IA respondió sola y el mensaje salió a WhatsApp.",
                payload: {
                    suggestionId: params.suggestion.id,
                    conversationId: params.conversationId,
                    messageId: message.id,
                    confidence: params.parsed.confidence,
                    intent: params.parsed.intent
                }
            }).catch(() => undefined);
        } catch (error) {
            /**
             * No se reintenta: el mensaje no salió. Antes de asignar a una
             * persona conviene distinguir un fallo real de Meta de una
             * compuerta que se cerró mientras el trabajo esperaba (una
             * persona contestó, se pausó la IA, se cerró el hilo o la
             * ventana). En ese segundo caso no hay nada que entregar.
             */
            const fresh = await prisma.conversation.findFirst({
                where: {
                    id: params.conversationId,
                    workspaceId: params.workspaceId
                },
                include: { contact: true }
            });

            const alreadyHandled =
                !fresh ||
                fresh.status !== "OPEN" ||
                Boolean(fresh.aiPausedAt) ||
                Boolean(fresh.contact.optOutAt) ||
                Boolean(fresh.contact.pausedAt);

            await prisma.aiSuggestion.update({
                where: { id: params.suggestion.id },
                data: {
                    status: alreadyHandled
                        ? AiSuggestionStatus.SUPERSEDED
                        : AiSuggestionStatus.HANDOFF,
                    decidedAt: new Date()
                }
            });

            await LogService.create({
                workspaceId: params.workspaceId,
                level: alreadyHandled ? LogLevel.INFO : LogLevel.ERROR,
                module: LogModule.AI,
                action: "AI_AUTO_REPLY_SKIPPED",
                message: alreadyHandled
                    ? "La respuesta automática ya no aplicaba al momento de enviar."
                    : "No se pudo enviar la respuesta automática.",
                payload: {
                    suggestionId: params.suggestion.id,
                    conversationId: params.conversationId,
                    reason: alreadyHandled ? "STATE_CHANGED" : "SEND_FAILED",
                    error: error instanceof Error ? error.message : null
                }
            }).catch(() => undefined);

            if (!alreadyHandled) {
                await AiAutoReplyService.handoff({
                    workspaceId: params.workspaceId,
                    conversationId: params.conversationId,
                    reason: "SEND_FAILED",
                    detail: error instanceof Error ? error.message : null
                });
            }
        }
    }

    /**
     * Cuando el modo automático no puede responder, deja el resultado
     * auditado. Solo entrega a una persona cuando hay algo que atender; si
     * el contacto pidió baja o la ventana está cerrada, no se asigna a nadie.
     */
    private static async registerAutoSkip(params: {
        workspaceId: string;
        conversationId: string;
        suggestionId: string;
        reason: SuggestionSkipReason;
    }) {
        const alreadyHandled =
            params.reason === "HUMAN_REPLIED" ||
            params.reason === "CONVERSATION_AI_PAUSED";
        const cannotReply =
            params.reason === "CONTACT_OPTED_OUT" ||
            params.reason === "CONTACT_PAUSED" ||
            params.reason === "CONVERSATION_CLOSED" ||
            params.reason === "WINDOW_CLOSED" ||
            params.reason === "MODE_NOT_AUTO";
        const needsPerson = !alreadyHandled && !cannotReply;
        /**
         * Los límites y el presupuesto son capacidad, no contenido: se avisa
         * a una persona pero no se deja la IA pausada para siempre. El resto
         * de entregas sí la apartan del hilo hasta que alguien la reactive.
         */
        const capacityOnly =
            params.reason === "DAILY_LIMIT" ||
            params.reason === "BUDGET_EXCEEDED";

        await prisma.aiSuggestion.update({
            where: { id: params.suggestionId },
            data: {
                status: alreadyHandled
                    ? AiSuggestionStatus.SUPERSEDED
                    : needsPerson
                      ? AiSuggestionStatus.HANDOFF
                      : AiSuggestionStatus.DISCARDED,
                decidedAt: new Date()
            }
        });

        await LogService.create({
            workspaceId: params.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.AI,
            action: "AI_AUTO_REPLY_SKIPPED",
            message: "La IA no respondió sola.",
            payload: {
                suggestionId: params.suggestionId,
                conversationId: params.conversationId,
                reason: params.reason
            }
        }).catch(() => undefined);

        if (needsPerson) {
            await AiAutoReplyService.handoff({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                reason: params.reason,
                pause: !capacityOnly
            });
        }
    }

    /**
     * Consola de prueba: responde una pregunta sin guardar nada ni tocar el
     * hilo. Sirve para calibrar la base de conocimiento antes de encender la
     * IA en producción.
     */
    static async preview(params: {
        workspaceId: string;
        question: string;
    }): Promise<{
        result: ParsedAiReply;
        knowledge: Array<{ question: string; answer: string }>;
        model: string;
        latencyMs: number;
    }> {
        if (!isProviderConfigured()) {
            throw new Error(
                "Falta configurar el proveedor de IA (AI_API_KEY). No se puede probar todavía."
            );
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: params.workspaceId },
            select: { name: true }
        });

        if (!workspace) {
            throw new Error("Workspace no encontrado.");
        }

        const settings = await AiSettingsService.get(params.workspaceId);
        const knowledge = await KnowledgeService.rank(
            params.workspaceId,
            params.question,
            appConfig.ai.maxKnowledgeEntries
        );

        const system = buildSystemPrompt({
            workspaceName: workspace.name,
            settings,
            knowledge: knowledge.map((entry) => ({
                question: entry.question,
                answer: entry.answer
            }))
        });

        const provider = createAiProvider();
        const completion = await provider.complete({
            system,
            messages: [buildIncomingMessage(params.question)],
            maxTokens: appConfig.ai.maxTokens,
            temperature: appConfig.ai.temperature,
            model: settings.model || undefined
        });

        return {
            result: parseModelOutput(completion.text),
            knowledge: knowledge.map((entry) => ({
                question: entry.question,
                answer: entry.answer
            })),
            model: completion.model,
            latencyMs: completion.latencyMs
        };
    }

    static async latestPending(workspaceId: string, conversationId: string) {
        return prisma.aiSuggestion.findFirst({
            where: {
                workspaceId,
                conversationId,
                status: AiSuggestionStatus.PENDING
            },
            orderBy: { createdAt: "desc" }
        });
    }

    /** Texto que se precarga en el compositor cuando alguien usa el borrador. */
    static async bodyForUse(params: {
        workspaceId: string;
        conversationId: string;
        suggestionId: string;
    }): Promise<string> {
        const suggestion = await prisma.aiSuggestion.findFirst({
            where: {
                id: params.suggestionId,
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                status: {
                    in: [
                        AiSuggestionStatus.ACCEPTED,
                        AiSuggestionStatus.EDITED
                    ]
                }
            },
            select: { body: true }
        });

        return suggestion?.body || "";
    }

    /**
     * Registra lo que pasó cuando una persona envió un mensaje.
     *
     * Hace dos cosas:
     * 1. Cualquier borrador pendiente deja de aplicar: la conversación ya
     *    avanzó sin él y no debe seguir ofreciéndose en la bandeja.
     * 2. Si la persona había aprobado uno y cambió el texto, pasa a
     *    `EDITED` para que la tasa de aceptación sea honesta.
     *
     * Solo mira borradores en `ACCEPTED`: si alguien contestó por su cuenta
     * mientras había uno pendiente, no se le atribuye el cambio.
     *
     * No lanza: un fallo de métrica nunca debe impedir que salga el mensaje.
     */
    static async noteManualSend(params: {
        workspaceId: string;
        conversationId: string;
        body: string;
    }): Promise<void> {
        try {
            await prisma.aiSuggestion.updateMany({
                where: {
                    workspaceId: params.workspaceId,
                    conversationId: params.conversationId,
                    status: AiSuggestionStatus.PENDING
                },
                data: {
                    status: AiSuggestionStatus.SUPERSEDED,
                    decidedAt: new Date()
                }
            });

            const suggestion = await prisma.aiSuggestion.findFirst({
                where: {
                    workspaceId: params.workspaceId,
                    conversationId: params.conversationId,
                    status: AiSuggestionStatus.ACCEPTED
                },
                orderBy: { decidedAt: "desc" },
                select: { id: true, body: true }
            });

            if (!suggestion) {
                return;
            }

            const normalize = (value: string) =>
                value.replace(/\s+/g, " ").trim();

            if (normalize(suggestion.body) === normalize(params.body)) {
                return;
            }

            await prisma.aiSuggestion.updateMany({
                where: {
                    id: suggestion.id,
                    status: AiSuggestionStatus.ACCEPTED
                },
                data: { status: AiSuggestionStatus.EDITED }
            });
        } catch {
            /** La métrica es secundaria: se ignora cualquier fallo. */
        }
    }

    /**
     * Marca la decisión de una persona. Solo actúa si el borrador sigue
     * pendiente: dos clics no reescriben la métrica.
     */
    static async markDecided(params: {
        workspaceId: string;
        conversationId: string;
        suggestionId: string;
        status:
            | "ACCEPTED"
            | "EDITED"
            | "DISCARDED";
        userId: string;
    }) {
        const changed = await prisma.aiSuggestion.updateMany({
            where: {
                id: params.suggestionId,
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                status: AiSuggestionStatus.PENDING
            },
            data: {
                status: params.status,
                decidedById: params.userId,
                decidedAt: new Date()
            }
        });

        const suggestion = await prisma.aiSuggestion.findFirst({
            where: {
                id: params.suggestionId,
                workspaceId: params.workspaceId,
                conversationId: params.conversationId
            }
        });

        if (!suggestion) {
            throw new Error("Borrador de IA no encontrado.");
        }

        if (changed.count > 0) {
            await LogService.create({
                workspaceId: params.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.AI,
                action:
                    params.status === AiSuggestionStatus.DISCARDED
                        ? "AI_SUGGESTION_DISCARDED"
                        : "AI_SUGGESTION_ACCEPTED",
                message:
                    params.status === AiSuggestionStatus.DISCARDED
                        ? "Una persona descartó un borrador de IA."
                        : "Una persona usó un borrador de IA.",
                payload: {
                    suggestionId: suggestion.id,
                    conversationId: params.conversationId,
                    status: params.status,
                    decidedById: params.userId
                }
            });
        }

        return suggestion;
    }

    static async stats(
        workspaceId: string,
        since: Date
    ): Promise<SuggestionStats> {
        const [grouped, usage] = await Promise.all([
            prisma.aiSuggestion.groupBy({
                by: ["status"],
                where: {
                    workspaceId,
                    createdAt: { gte: since }
                },
                _count: { _all: true }
            }),
            prisma.aiUsage.aggregate({
                where: {
                    workspaceId,
                    createdAt: { gte: since }
                },
                _count: { _all: true },
                _sum: {
                    promptTokens: true,
                    completionTokens: true,
                    costMicros: true
                }
            })
        ]);

        const byStatus = new Map(
            grouped.map((row) => [row.status, row._count._all])
        );

        const accepted = byStatus.get(AiSuggestionStatus.ACCEPTED) || 0;
        const edited = byStatus.get(AiSuggestionStatus.EDITED) || 0;
        const discarded = byStatus.get(AiSuggestionStatus.DISCARDED) || 0;
        const pending = byStatus.get(AiSuggestionStatus.PENDING) || 0;
        const superseded = byStatus.get(AiSuggestionStatus.SUPERSEDED) || 0;
        const autoSent = byStatus.get(AiSuggestionStatus.AUTO_SENT) || 0;
        const handoffs = byStatus.get(AiSuggestionStatus.HANDOFF) || 0;
        const decided = accepted + edited + discarded;

        return {
            total:
                accepted +
                edited +
                discarded +
                pending +
                superseded +
                autoSent +
                handoffs,
            pending,
            accepted,
            edited,
            discarded,
            superseded,
            autoSent,
            handoffs,
            costMicros: usage._sum.costMicros || 0,
            acceptanceRate: decided > 0 ? (accepted + edited) / decided : null,
            calls: usage._count._all,
            promptTokens: usage._sum.promptTokens || 0,
            completionTokens: usage._sum.completionTokens || 0
        };
    }

    /**
     * Resumen de IA de un solo hilo, para el panel de la conversación.
     *
     * No recibe fecha: el hilo puede durar meses y aquí interesa todo su
     * historial, no una ventana de 30 días como en la consola de Admin.
     */
    static async conversationSummary(
        workspaceId: string,
        conversationId: string
    ): Promise<ConversationAiSummary> {
        const [grouped, usage, last] = await Promise.all([
            prisma.aiSuggestion.groupBy({
                by: ["status"],
                where: { workspaceId, conversationId },
                _count: { _all: true }
            }),
            prisma.aiUsage.aggregate({
                where: { workspaceId, conversationId },
                _sum: { costMicros: true }
            }),
            prisma.aiSuggestion.findFirst({
                where: { workspaceId, conversationId },
                orderBy: { createdAt: "desc" },
                select: {
                    status: true,
                    intent: true,
                    confidence: true,
                    handoff: true,
                    reason: true,
                    createdAt: true
                }
            })
        ]);

        const byStatus = new Map(
            grouped.map((row) => [row.status, row._count._all])
        );

        const pending = byStatus.get(AiSuggestionStatus.PENDING) || 0;
        const accepted = byStatus.get(AiSuggestionStatus.ACCEPTED) || 0;
        const edited = byStatus.get(AiSuggestionStatus.EDITED) || 0;
        const discarded = byStatus.get(AiSuggestionStatus.DISCARDED) || 0;
        const superseded = byStatus.get(AiSuggestionStatus.SUPERSEDED) || 0;
        const autoSent = byStatus.get(AiSuggestionStatus.AUTO_SENT) || 0;
        const handoffs = byStatus.get(AiSuggestionStatus.HANDOFF) || 0;

        return {
            total:
                pending +
                accepted +
                edited +
                discarded +
                superseded +
                autoSent +
                handoffs,
            pending,
            accepted,
            edited,
            discarded,
            superseded,
            autoSent,
            handoffs,
            costMicros: usage._sum.costMicros || 0,
            last: last ?? null
        };
    }
}
