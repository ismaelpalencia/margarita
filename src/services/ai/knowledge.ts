import { Prisma } from "@prisma/client";

import { prisma } from "../../config/prisma";
import { InteractiveButton } from "../../utils/interactive-message";

const STOPWORDS = new Set([
    "a",
    "al",
    "algo",
    "algun",
    "alguna",
    "algunas",
    "alguno",
    "algunos",
    "ante",
    "antes",
    "como",
    "con",
    "contra",
    "cual",
    "cuales",
    "cuando",
    "de",
    "del",
    "desde",
    "donde",
    "dos",
    "el",
    "ella",
    "ellas",
    "ellos",
    "en",
    "entre",
    "era",
    "es",
    "esa",
    "ese",
    "eso",
    "esta",
    "estan",
    "este",
    "esto",
    "fue",
    "ha",
    "hasta",
    "hay",
    "la",
    "las",
    "le",
    "les",
    "lo",
    "los",
    "mas",
    "me",
    "mi",
    "mis",
    "mucho",
    "muy",
    "no",
    "nos",
    "o",
    "para",
    "pero",
    "poco",
    "por",
    "porque",
    "que",
    "quien",
    "se",
    "sin",
    "sobre",
    "su",
    "sus",
    "te",
    "tiene",
    "todo",
    "tu",
    "tus",
    "un",
    "una",
    "uno",
    "unos",
    "y",
    "ya",
    "yo"
]);

export type RankableKnowledgeEntry = {
    id: string;
    question: string;
    answer: string;
    buttons?: unknown;
    keywords: string[];
    priority: number;
};

/** Minúsculas y sin acentos, para comparar «dirección» con «direccion». */
export function normalizeText(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

export function tokenize(value: string): string[] {
    return normalizeText(value)
        .split(/[^a-z0-9ñ]+/)
        .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

/**
 * Recuperación por palabras clave y solapamiento de la pregunta.
 *
 * No usa embeddings ni `pgvector` a propósito: una base de conocimiento de
 * empresa tiene cientos de entradas, no millones. Se puntúa en memoria y se
 * mandan al modelo los fragmentos más relevantes. Si algún día el volumen lo
 * pide, se cambia esta función por una búsqueda semántica sin tocar el resto.
 */
export function rankKnowledgeEntries(
    entries: RankableKnowledgeEntry[],
    query: string,
    limit: number
): RankableKnowledgeEntry[] {
    const normalizedQuery = normalizeText(query);
    const queryTokens = new Set(tokenize(query));

    if (!normalizedQuery || queryTokens.size === 0) {
        return [];
    }

    const scored = entries
        .map((entry) => {
            let score = 0;

            const normalizedQuestion = normalizeText(entry.question);
            const questionTokens = tokenize(entry.question);

            for (const keyword of entry.keywords) {
                const normalizedKeyword = normalizeText(keyword);

                if (
                    normalizedKeyword.length >= 3 &&
                    normalizedQuery.includes(normalizedKeyword)
                ) {
                    score += 4;
                }
            }

            let questionHits = 0;

            for (const token of questionTokens) {
                if (queryTokens.has(token)) {
                    questionHits += 1;
                }
            }

            score += Math.min(questionHits, 4);

            /**
             * Si la pregunta cargada aparece casi completa dentro del mensaje
             * («¿cuál es el horario de atención?»), es la mejor señal.
             */
            if (
                normalizedQuestion.length >= 12 &&
                (normalizedQuery.includes(normalizedQuestion) ||
                    normalizedQuestion.includes(normalizedQuery))
            ) {
                score += 3;
            }

            /**
             * La prioridad solo desempata entre entradas que ya coinciden.
             * Sumarla siempre haría que una entrada prioritaria apareciera
             * como «relevante» para cualquier pregunta.
             */
            if (score > 0) {
                score += Math.min(entry.priority, 20) * 0.1;
            }

            return { entry, score };
        })
        .filter((item) => item.score > 0)
        .sort(
            (a, b) =>
                b.score - a.score ||
                b.entry.priority - a.entry.priority ||
                a.entry.question.localeCompare(b.entry.question)
        );

    return scored.slice(0, Math.max(1, limit)).map((item) => item.entry);
}

export class KnowledgeService {
    static async list(workspaceId: string) {
        return prisma.knowledgeEntry.findMany({
            where: { workspaceId },
            orderBy: [{ isActive: "desc" }, { priority: "desc" }, { question: "asc" }]
        });
    }

    static async listActive(workspaceId: string) {
        return prisma.knowledgeEntry.findMany({
            where: { workspaceId, isActive: true },
            orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
            take: 500
        });
    }

    static async getById(workspaceId: string, entryId: string) {
        const entry = await prisma.knowledgeEntry.findFirst({
            where: { id: entryId, workspaceId }
        });

        if (!entry) {
            throw new Error("Entrada de conocimiento no encontrada.");
        }

        return entry;
    }

    static async rank(workspaceId: string, query: string, limit: number) {
        const entries = await this.listActive(workspaceId);

        return rankKnowledgeEntries(entries, query, limit);
    }

    static async create(
        workspaceId: string,
        userId: string,
        input: {
            question: string;
            answer: string;
            buttons: InteractiveButton[] | null;
            keywords: string[];
            priority: number;
            sourceKey?: string | null;
        }
    ) {
        return prisma.knowledgeEntry.create({
            data: {
                workspaceId,
                createdById: userId,
                question: input.question,
                answer: input.answer,
                buttons: input.buttons
                    ? (input.buttons as unknown as Prisma.InputJsonValue)
                    : undefined,
                keywords: input.keywords,
                priority: input.priority,
                sourceKey: input.sourceKey ?? null,
                isActive: true
            }
        });
    }

    static async update(
        workspaceId: string,
        entryId: string,
        input: {
            question: string;
            answer: string;
            buttons: InteractiveButton[] | null;
            keywords: string[];
            priority: number;
        }
    ) {
        await this.getById(workspaceId, entryId);

        return prisma.knowledgeEntry.update({
            where: { id: entryId },
            data: {
                question: input.question,
                answer: input.answer,
                buttons: input.buttons
                    ? (input.buttons as unknown as Prisma.InputJsonValue)
                    : Prisma.DbNull,
                keywords: input.keywords,
                priority: input.priority
            }
        });
    }

    static async setActive(
        workspaceId: string,
        entryId: string,
        isActive: boolean
    ) {
        await this.getById(workspaceId, entryId);

        return prisma.knowledgeEntry.update({
            where: { id: entryId },
            data: { isActive }
        });
    }
}
