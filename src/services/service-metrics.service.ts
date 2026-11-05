import {
    AiJobStatus,
    AiSuggestionStatus,
    FeedbackValue,
    MessageDirection,
    MessageSource
} from "@prisma/client";

import { prisma } from "../config/prisma";
import { percentile } from "../utils/metrics";

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date: Date, timezone: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(date);
}

function normalize(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

export type ServiceMetrics = Awaited<ReturnType<typeof ServiceMetricsService.summary>>;

export class ServiceMetricsService {
    static async summary(workspaceId: string, timezone: string, days = 14) {
        const since = new Date(Date.now() - days * DAY_MS);
        const since30 = new Date(Date.now() - 30 * DAY_MS);

        const outMessages = await prisma.message.findMany({
            where: {
                workspaceId,
                direction: MessageDirection.OUT,
                isInternalNote: false,
                createdAt: { gte: since }
            },
            select: {
                conversationId: true,
                source: true,
                aiSuggestionId: true,
                createdAt: true
            },
            take: 20000
        });

        const daysList: string[] = [];

        for (let offset = days - 1; offset >= 0; offset -= 1) {
            daysList.push(dayKey(new Date(Date.now() - offset * DAY_MS), timezone));
        }

        const aiByDay = new Map<string, Set<string>>();
        const humanByDay = new Map<string, Set<string>>();

        for (const message of outMessages) {
            const key = dayKey(message.createdAt, timezone);
            const isAi =
                message.source === MessageSource.AUTOMATIC &&
                Boolean(message.aiSuggestionId);
            const isHuman = message.source === MessageSource.MANUAL;

            if (isAi) {
                if (!aiByDay.has(key)) aiByDay.set(key, new Set());
                aiByDay.get(key)!.add(message.conversationId);
            }

            if (isHuman) {
                if (!humanByDay.has(key)) humanByDay.set(key, new Set());
                humanByDay.get(key)!.add(message.conversationId);
            }
        }

        const aiHuman = daysList.map((day) => {
            const ai = aiByDay.get(day) ?? new Set<string>();
            const human = humanByDay.get(day) ?? new Set<string>();
            let both = 0;

            for (const id of ai) {
                if (human.has(id)) both += 1;
            }

            return {
                day,
                ai: ai.size,
                human: human.size,
                both
            };
        });

        /** Primera respuesta: primer OUT después del primer IN de cada hilo. */
        const threadMessages = await prisma.message.findMany({
            where: {
                workspaceId,
                createdAt: { gte: since30 },
                isInternalNote: false
            },
            select: {
                conversationId: true,
                direction: true,
                createdAt: true
            },
            orderBy: { createdAt: "asc" },
            take: 20000
        });

        const firstIn = new Map<string, Date>();
        const responseMinutes: number[] = [];

        for (const message of threadMessages) {
            if (message.direction === MessageDirection.IN) {
                if (!firstIn.has(message.conversationId)) {
                    firstIn.set(message.conversationId, message.createdAt);
                }

                continue;
            }

            const inboundAt = firstIn.get(message.conversationId);

            if (!inboundAt) {
                continue;
            }

            const deltaMinutes = (message.createdAt.getTime() - inboundAt.getTime()) / 60000;

            if (deltaMinutes >= 0) {
                responseMinutes.push(deltaMinutes);
                firstIn.delete(message.conversationId);
            }
        }

        const firstResponse = {
            samples: responseMinutes.length,
            medianMinutes: percentile(responseMinutes, 50),
            p90Minutes: percentile(responseMinutes, 90)
        };

        /** Resolución sin persona: hilos con respuesta automática y sin mensaje humano. */
        const autoConversations = new Set<string>();
        const manualConversations = new Set<string>();

        for (const message of outMessages) {
            if (
                message.source === MessageSource.AUTOMATIC &&
                message.aiSuggestionId
            ) {
                autoConversations.add(message.conversationId);
            }

            if (message.source === MessageSource.MANUAL) {
                manualConversations.add(message.conversationId);
            }
        }

        const autoIds = [...autoConversations];
        const closed = await prisma.conversation.findMany({
            where: { workspaceId, id: { in: autoIds }, status: "CLOSED" },
            select: { id: true }
        });
        const closedIds = new Set(closed.map((row) => row.id));

        let resolvedWithoutHuman = 0;

        for (const id of autoIds) {
            if (!manualConversations.has(id) && closedIds.has(id)) {
                resolvedWithoutHuman += 1;
            }
        }

        const resolution = {
            autoHandled: autoConversations.size,
            resolvedWithoutHuman,
            rate:
                autoConversations.size > 0
                    ? resolvedWithoutHuman / autoConversations.size
                    : null
        };

        /** Preguntas sin cobertura: trabajos omitidos por NO_KNOWLEDGE. */
        const skippedJobs = await prisma.aiSuggestionJob.findMany({
            where: {
                workspaceId,
                status: AiJobStatus.SKIPPED,
                skipReason: "NO_KNOWLEDGE",
                createdAt: { gte: since30 }
            },
            orderBy: { createdAt: "desc" },
            take: 500,
            select: { inboundMessageId: true }
        });

        const skippedMessages = await prisma.message.findMany({
            where: { id: { in: skippedJobs.map((job) => job.inboundMessageId) } },
            select: { body: true }
        });

        const uncoveredMap = new Map<string, { question: string; count: number }>();

        for (const message of skippedMessages) {
            const text = (message.body || "").trim();

            if (!text) {
                continue;
            }

            const key = normalize(text);
            const current = uncoveredMap.get(key);

            if (current) {
                current.count += 1;
            } else {
                uncoveredMap.set(key, { question: text.slice(0, 180), count: 1 });
            }
        }

        const uncovered = [...uncoveredMap.values()]
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        /** Resolución sin persona aproximada por entrada de KB (vía intención). */
        const [entries, suggestions] = await Promise.all([
            prisma.knowledgeEntry.findMany({
                where: { workspaceId, isActive: true },
                select: { id: true, question: true, keywords: true }
            }),
            prisma.aiSuggestion.findMany({
                where: { workspaceId, createdAt: { gte: since30 } },
                select: { intent: true, status: true },
                take: 2000
            })
        ]);

        const kbResolution = entries
            .map((entry) => {
                const keywords = entry.keywords.map(normalize).filter(Boolean);
                const matched = suggestions.filter((suggestion) => {
                    const intent = normalize(suggestion.intent || "");
                    return (
                        intent.length > 0 &&
                        keywords.some((keyword) => intent.includes(keyword))
                    );
                });
                const autoSent = matched.filter(
                    (suggestion) => suggestion.status === AiSuggestionStatus.AUTO_SENT
                ).length;

                return {
                    question: entry.question,
                    matched: matched.length,
                    autoSent,
                    rate: matched.length > 0 ? autoSent / matched.length : null
                };
            })
            .filter((row) => row.matched > 0)
            .sort((a, b) => b.matched - a.matched)
            .slice(0, 10);

        const [flags, feedbackRows] = await Promise.all([
            prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { feedbackEnabled: true }
            }),
            prisma.conversationFeedback.groupBy({
                by: ["value"],
                where: { workspaceId },
                _count: { _all: true }
            })
        ]);

        const feedbackUp =
            feedbackRows.find((row) => row.value === FeedbackValue.UP)?._count._all ?? 0;
        const feedbackDown =
            feedbackRows.find((row) => row.value === FeedbackValue.DOWN)?._count._all ?? 0;

        return {
            days: daysList,
            aiHuman,
            firstResponse,
            resolution,
            uncovered,
            kbResolution,
            feedback: {
                enabled: Boolean(flags?.feedbackEnabled),
                up: feedbackUp,
                down: feedbackDown
            }
        };
    }
}