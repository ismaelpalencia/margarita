import {
    LogLevel,
    LogModule,
    MessageDirection,
    OffHoursMode
} from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { LogService } from "./log.service";
import { MessageService } from "./message.service";
import { AiSettingsService } from "./ai/settings.service";
import { KnowledgeService } from "./ai/knowledge";
import { decideGeneration } from "./ai/decision";
import {
    buildContextMessages,
    buildIncomingMessage,
    buildSystemPrompt,
    parseModelOutput
} from "./ai/prompt";
import { createAiProvider, isAiConfigured } from "./ai/provider";

type OffHoursWorkspace = {
    id: string;
    name: string;
    offHoursMode: OffHoursMode;
    offHoursMessage: string | null;
    offHoursReplyIntervalHours: number;
};

type OffHoursInbound = {
    workspace: OffHoursWorkspace;
    conversationId: string;
    inboundMessageId: string;
    text: string;
};

/**
 * Respuesta fuera de horario.
 *
 * No toca el motor de IA existente: para AI_IF_COVERED reutiliza la política
 * pura (decideGeneration) y los helpers de prompt/proveedor, pero sin encolar
 * un trabajo en AiSuggestionJob. Es un camino corto y sincrónico: si la IA no
 * cubre, se responde con el mensaje fuera de horario y se deja el hilo para la
 * mañana.
 */
export class OffHoursService {
    /**
     * ¿Corresponde mandar el mensaje fuera de horario en este hilo? Es la
     * compuerta de "una vez por intervalo": si ya se mandó hace menos del
     * intervalo configurado, no se repite.
     */
    static async isReplyDue(
        conversationId: string,
        intervalHours: number,
        now: Date
    ): Promise<boolean> {
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { lastOffHoursReplyAt: true }
        });

        if (!conversation?.lastOffHoursReplyAt) {
            return true;
        }

        const elapsed = now.getTime() - conversation.lastOffHoursReplyAt.getTime();

        return elapsed >= intervalHours * 60 * 60 * 1000;
    }

    private static async markReplied(conversationId: string, at: Date) {
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { lastOffHoursReplyAt: at }
        });
    }

    private static async markHandoff(conversationId: string, at: Date) {
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { aiHandoffAt: at, aiHandoffReason: "OFF_HOURS" }
        });
    }

    private static async queue(
        workspaceId: string,
        conversationId: string,
        detail: object
    ) {
        await LogService.create({
            workspaceId,
            level: LogLevel.INFO,
            module: LogModule.MESSAGE,
            action: "OFF_HOURS_QUEUED",
            message: "Mensaje recibido fuera de horario: queda en la bandeja para la mañana.",
            payload: { conversationId, ...detail }
        }).catch(() => undefined);
    }

    private static async logReply(
        workspaceId: string,
        conversationId: string,
        mode: OffHoursMode,
        messageId: string
    ) {
        await LogService.create({
            workspaceId,
            level: LogLevel.INFO,
            module: LogModule.MESSAGE,
            action: "OFF_HOURS_REPLY_SENT",
            message: "Se respondió un mensaje recibido fuera de horario.",
            payload: { conversationId, messageId, mode }
        }).catch(() => undefined);
    }

    /**
     * Atiende un mensaje que llegó fuera de horario según el modo configurado.
     * Devuelve true si se envió una respuesta automática (texto o IA).
     */
    static async handle(params: OffHoursInbound): Promise<boolean> {
        const { workspace, conversationId, inboundMessageId } = params;
        const now = new Date();
        const mode = workspace.offHoursMode;

        if (mode === OffHoursMode.QUEUE_ONLY) {
            await this.queue(workspace.id, conversationId, {
                mode,
                inboundMessageId
            });

            return false;
        }

        if (mode === OffHoursMode.AI_IF_COVERED) {
            const covered = await this.tryReplyIfCovered({
                workspace,
                conversationId,
                text: params.text,
                now
            });

            if (covered) {
                return true;
            }

            /** No cubierto: mensaje fuera de horario + entrega con motivo. */
            await this.markHandoff(conversationId, now);
            await this.sendOffHoursMessage(workspace, conversationId, now);
            await this.queue(workspace.id, conversationId, {
                mode,
                inboundMessageId,
                handoff: "OFF_HOURS"
            });

            return true;
        }

        /** TEXT_ONLY (y cualquier valor inesperado cae aquí). */
        await this.sendOffHoursMessage(workspace, conversationId, now);
        await this.queue(workspace.id, conversationId, { mode, inboundMessageId });

        return true;
    }

    private static async sendOffHoursMessage(
        workspace: OffHoursWorkspace,
        conversationId: string,
        now: Date
    ): Promise<boolean> {
        const body = workspace.offHoursMessage?.trim();

        if (!body) {
            return false;
        }

        if (
            !(await this.isReplyDue(
                conversationId,
                workspace.offHoursReplyIntervalHours,
                now
            ))
        ) {
            return false;
        }

        try {
            const message = await MessageService.sendOffHoursReply({
                workspaceId: workspace.id,
                conversationId,
                body
            });

            await this.markReplied(conversationId, now);
            await this.logReply(
                workspace.id,
                conversationId,
                OffHoursMode.TEXT_ONLY,
                message.id
            );

            return true;
        } catch {
            return false;
        }
    }

    /**
     * Genera una respuesta con la IA y la envía solo si la base de conocimiento
     * cubre la pregunta y la confianza alcanza el umbral. No inventa y no toca
     * el motor de sugerencias/automático existente.
     */
    private static async tryReplyIfCovered(params: {
        workspace: OffHoursWorkspace;
        conversationId: string;
        text: string;
        now: Date;
    }): Promise<boolean> {
        if (!isAiConfigured()) {
            return false;
        }

        const settings = await AiSettingsService.get(params.workspace.id);

        if (!settings.enabled) {
            return false;
        }

        const conversation = await prisma.conversation.findUnique({
            where: { id: params.conversationId },
            include: { contact: true }
        });

        if (!conversation) {
            return false;
        }

        const inboundMessage = await prisma.message.findFirst({
            where: {
                conversationId: params.conversationId,
                direction: MessageDirection.IN,
                deletedAt: null
            },
            orderBy: { createdAt: "desc" }
        });

        if (!inboundMessage) {
            return false;
        }

        const decision = decideGeneration({
            globalEnabled: appConfig.ai.enabled,
            settings: { enabled: settings.enabled, mode: settings.mode },
            contact: {
                optOutAt: conversation.contact.optOutAt,
                pausedAt: conversation.contact.pausedAt
            },
            conversation: {
                status: conversation.status,
                lastIncomingMessageAt: conversation.lastIncomingMessageAt,
                aiPausedAt: conversation.aiPausedAt
            },
            message: {
                direction: inboundMessage.direction,
                body: inboundMessage.body,
                replyTitle: inboundMessage.replyTitle,
                deletedAt: inboundMessage.deletedAt,
                createdAt: inboundMessage.createdAt
            },
            newerInboundExists: false,
            humanRepliedAfter: false,
            now: params.now
        });

        if (!decision.generate) {
            return false;
        }

        const knowledge = await KnowledgeService.rank(
            params.workspace.id,
            decision.text,
            appConfig.ai.maxKnowledgeEntries
        );

        if (knowledge.length === 0) {
            return false;
        }

        const previousMessages = await prisma.message.findMany({
            where: {
                conversationId: params.conversationId,
                createdAt: { lt: inboundMessage.createdAt },
                deletedAt: null,
                isInternalNote: false
            },
            orderBy: { createdAt: "desc" },
            take: appConfig.ai.maxContextMessages,
            select: { direction: true, body: true, createdAt: true }
        });

        const system = buildSystemPrompt({
            workspaceName: params.workspace.name,
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

        const covered =
            !parsed.handoff &&
            parsed.confidence >= settings.confidenceMin &&
            parsed.reply.trim().length > 0;

        if (!covered) {
            return false;
        }

        if (
            !(await this.isReplyDue(
                params.conversationId,
                params.workspace.offHoursReplyIntervalHours,
                params.now
            ))
        ) {
            return false;
        }

        try {
            const message = await MessageService.sendOffHoursReply({
                workspaceId: params.workspace.id,
                conversationId: params.conversationId,
                body: parsed.reply
            });

            await this.markReplied(params.conversationId, params.now);
            await this.logReply(
                params.workspace.id,
                params.conversationId,
                OffHoursMode.AI_IF_COVERED,
                message.id
            );

            return true;
        } catch {
            return false;
        }
    }
}
