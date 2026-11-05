import { appConfig } from "../config/app.config";
import { rankKnowledgeEntries, RankableKnowledgeEntry } from "./ai/knowledge";
import { decideGeneration } from "./ai/decision";
import {
    buildIncomingMessage,
    buildSystemPrompt,
    parseModelOutput
} from "./ai/prompt";
import { createAiProvider, isProviderConfigured } from "./ai/provider";
import { estimateCostMicros } from "./ai/pricing";
import fs from "node:fs";
import path from "node:path";

type DemoKbEntry = { question: string; answer: string; tags?: string[] };

type DemoSession = {
    id: string;
    vertical: string;
    createdAt: number;
    lastActiveAt: number;
    messageCount: number;
};

const MAX_MESSAGES_PER_SESSION = 30;
const MAX_SESSIONS_PER_IP = 3;
const SESSION_TTL_MS = 30 * 60 * 1000;

const sessions = new Map<string, DemoSession>();
const sessionsPerIp = new Map<string, { day: string; count: number }>();
const kbCache = new Map<string, RankableKnowledgeEntry[]>();

function todayKey(): string {
    return new Date().toISOString().slice(0, 10);
}

function loadKb(vertical: string): RankableKnowledgeEntry[] {
    const cached = kbCache.get(vertical);

    if (cached) {
        return cached;
    }

    const file = path.join(process.cwd(), "seeds", "verticals", `${vertical}.json`);
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { kb?: DemoKbEntry[] };
    const entries = (raw.kb || []).map((entry, index) => ({
        id: `${vertical}-${index}`,
        question: entry.question,
        answer: entry.answer,
        keywords: entry.tags || [],
        priority: 0
    }));

    kbCache.set(vertical, entries);

    return entries;
}

export type DemoChatResult = {
    reply: string;
    intent: string;
    confidence: number;
    handoff: boolean;
    mode: string;
    costMicros: number;
    usedEntries: number;
};

export class DemoService {
    static enabled(): boolean {
        return appConfig.demo.enabled;
    }

    /** Solo para pruebas: limpia el estado en memoria. */
    static _resetForTests() {
        sessions.clear();
        sessionsPerIp.clear();
        kbCache.clear();
    }

    /** Solo para pruebas: vence una sesión para comprobar la caducidad. */
    static _expireSessionForTests(sessionId: string) {
        const session = sessions.get(sessionId);

        if (session) {
            session.lastActiveAt = 0;
        }
    }

    /** Crea una sesión de demo con límite por IP (3 por día). */
    static createSession(ip: string): { ok: true; sessionId: string } | { ok: false; reason: string } {
        const day = todayKey();
        const current = sessionsPerIp.get(ip);
        const count = current && current.day === day ? current.count : 0;

        if (count >= MAX_SESSIONS_PER_IP) {
            return { ok: false, reason: "Se alcanzó el límite de demos por IP hoy." };
        }

        const sessionId = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const now = Date.now();

        sessions.set(sessionId, {
            id: sessionId,
            vertical: "comercio",
            createdAt: now,
            lastActiveAt: now,
            messageCount: 0
        });
        sessionsPerIp.set(ip, { day, count: count + 1 });

        return { ok: true, sessionId };
    }

    /**
     * Responde un mensaje de demo con la base de conocimiento del vertical.
     * No toca la base de datos real: todo vive en memoria.
     */
    static async chat(params: {
        sessionId: string;
        message: string;
        vertical?: string;
    }): Promise<
        | { ok: true; result: DemoChatResult }
        | { ok: false; status: number; reason: string }
    > {
        const session = sessions.get(params.sessionId);

        if (!session) {
            return { ok: false, status: 404, reason: "Sesión no encontrada o expirada." };
        }

        if (Date.now() - session.lastActiveAt > SESSION_TTL_MS) {
            sessions.delete(params.sessionId);

            return { ok: false, status: 410, reason: "La sesión expiró." };
        }

        if (session.messageCount >= MAX_MESSAGES_PER_SESSION) {
            return { ok: false, status: 429, reason: "Se alcanzó el límite de mensajes de la demo." };
        }

        const vertical = params.vertical || session.vertical;
        session.vertical = vertical;
        session.messageCount += 1;
        session.lastActiveAt = Date.now();

        const text = (params.message || "").trim();

        if (!text) {
            return { ok: false, status: 400, reason: "Escribe un mensaje." };
        }

        const settings = {
            enabled: true,
            mode: "AUTO" as const
        };

        const decision = decideGeneration({
            globalEnabled: true,
            settings,
            contact: { optOutAt: null, pausedAt: null },
            conversation: {
                status: "OPEN" as const,
                lastIncomingMessageAt: new Date(),
                aiPausedAt: null
            },
            message: {
                direction: "IN" as const,
                body: text,
                replyTitle: null,
                deletedAt: null,
                createdAt: new Date()
            },
            newerInboundExists: false,
            humanRepliedAfter: false,
            now: new Date()
        });

        if (!decision.generate) {
            return {
                ok: true,
                result: {
                    reply: "",
                    intent: "general",
                    confidence: 0,
                    handoff: true,
                    mode: "demo",
                    costMicros: 0,
                    usedEntries: 0
                }
            };
        }

        const knowledge = rankKnowledgeEntries(
            loadKb(vertical),
            decision.text,
            appConfig.ai.maxKnowledgeEntries
        );

        if (knowledge.length === 0) {
            return {
                ok: true,
                result: {
                    reply: "",
                    intent: "general",
                    confidence: 0,
                    handoff: true,
                    mode: "demo",
                    costMicros: 0,
                    usedEntries: 0
                }
            };
        }

        if (!isProviderConfigured()) {
            /** Sin llave de IA: responde directo de la entrada más relevante. */
            const top = knowledge[0];

            return {
                ok: true,
                result: {
                    reply: top.answer,
                    intent: top.keywords[0] || "general",
                    confidence: 0.9,
                    handoff: false,
                    mode: "demo",
                    costMicros: 0,
                    usedEntries: knowledge.length
                }
            };
        }

        const system = buildSystemPrompt({
            workspaceName: "Demo Margarita",
            settings: { language: "es-MX", tone: null, systemPrompt: null },
            knowledge: knowledge.map((entry) => ({
                question: entry.question,
                answer: entry.answer
            }))
        });

        const provider = createAiProvider();
        const completion = await provider.complete({
            system,
            messages: [buildIncomingMessage(decision.text)],
            maxTokens: appConfig.ai.maxTokens,
            temperature: appConfig.ai.temperature
        });
        const parsed = parseModelOutput(completion.text);

        return {
            ok: true,
            result: {
                reply: parsed.reply,
                intent: parsed.intent,
                confidence: parsed.confidence,
                handoff: parsed.handoff,
                mode: "demo",
                costMicros: estimateCostMicros({
                    model: completion.model,
                    promptTokens: completion.promptTokens,
                    completionTokens: completion.completionTokens
                }),
                usedEntries: knowledge.length
            }
        };
    }
}