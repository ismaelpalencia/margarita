import {
    AiSuggestionStatus,
    LogLevel,
    LogModule,
    MessageDirection,
    MessageSource
} from "@prisma/client";

import { appConfig } from "../../config/app.config";
import { prisma } from "../../config/prisma";
import { LogService } from "../log.service";
import { decideSuggestion, suggestionSkipLabel, SuggestionSkipReason } from "./decision";
import { KnowledgeService } from "./knowledge";
import {
    buildContextMessages,
    buildIncomingMessage,
    buildSystemPrompt,
    parseModelOutput,
    ParsedAiReply
} from "./prompt";
import { createAiProvider, isProviderConfigured } from "./provider";
import { AiSettingsService } from "./settings.service";

/** El trabajo no debe generar borrador. No es un error: es una decisión. */
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
    /** (aceptadas + editadas) / (aceptadas + editadas + descartadas). */
    acceptanceRate: number | null;
    calls: number;
    promptTokens: number;
    completionTokens: number;
};

export class AiSuggestionService {
    /**
     * Genera el borrador de un trabajo encolado.
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

        const decision = decideSuggestion({
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
                lastIncomingMessageAt: job.conversation.lastIncomingMessageAt
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

        const system = buildSystemPrompt({
            workspaceName: job.workspace.name,
            settings,
            knowledge: knowledge.map((entry) => ({
                question: entry.question,
                answer: entry.answer
            }))
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
                latencyMs: completion.latencyMs
            }
        });

        await LogService.create({
            workspaceId: job.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.AI,
            action: "AI_SUGGESTION_CREATED",
            message: "La IA generó un borrador de respuesta.",
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

        return suggestion;
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
                    completionTokens: true
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
        const decided = accepted + edited + discarded;

        return {
            total: accepted + edited + discarded + pending + superseded,
            pending,
            accepted,
            edited,
            discarded,
            superseded,
            acceptanceRate: decided > 0 ? (accepted + edited) / decided : null,
            calls: usage._count._all,
            promptTokens: usage._sum.promptTokens || 0,
            completionTokens: usage._sum.completionTokens || 0
        };
    }
}
