import {
    LogLevel,
    LogModule,
    MessageDirection,
    MessageSource
} from "@prisma/client";

import { prisma } from "../../config/prisma";
import { emitToWorkspaceAndUsers } from "../../sockets";
import { startOfMonthIn, startOfTodayIn } from "../../utils/date";
import { AssignmentService } from "../assignment.service";
import { LogService } from "../log.service";
import { SendPolicyService } from "../send-policy.service";

export type AutoReplyCounters = {
    repliesToday: number;
    repliesInThread: number;
    repliesThisMonth: number;
    spentMicrosThisMonth: number;
};

/**
 * Control humano y límites del modo automático.
 *
 * La IA nunca «decide» pausarse a sí misma: la pausa la pone una persona o
 * el envío de un mensaje humano. Aquí también se calcula el consumo real
 * que consulta la política antes de mandar nada.
 */
export class AiAutoReplyService {
    /**
     * Pausa la IA en un hilo. Si ya estaba pausada, conserva quién y cuándo
     * la pausó primero: dos clics no reescriben la auditoría.
     */
    static async pauseForHuman(params: {
        workspaceId: string;
        conversationId: string;
        userId: string | null;
        reason: string;
    }): Promise<boolean> {
        const changed = await prisma.conversation.updateMany({
            where: {
                id: params.conversationId,
                workspaceId: params.workspaceId,
                aiPausedAt: null
            },
            data: {
                aiPausedAt: new Date(),
                aiPausedById: params.userId
            }
        });

        if (changed.count === 0) {
            return false;
        }

        await LogService.create({
            workspaceId: params.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.AI,
            action: "AI_CONVERSATION_PAUSED",
            message: "La IA quedó en pausa en esta conversación.",
            payload: {
                conversationId: params.conversationId,
                userId: params.userId,
                reason: params.reason
            }
        }).catch(() => undefined);

        emitToWorkspaceAndUsers(
            params.workspaceId,
            [],
            "conversation:ai-paused",
            {
                conversationId: params.conversationId,
                aiPausedAt: new Date().toISOString(),
                aiPausedById: params.userId
            }
        );

        return true;
    }

    /** Reactiva la IA en un hilo. Solo una persona puede hacerlo. */
    static async resume(params: {
        workspaceId: string;
        conversationId: string;
        userId: string;
    }): Promise<boolean> {
        const changed = await prisma.conversation.updateMany({
            where: {
                id: params.conversationId,
                workspaceId: params.workspaceId,
                aiPausedAt: { not: null }
            },
            data: {
                aiPausedAt: null,
                aiPausedById: null,
                aiHandoffAt: null,
                aiHandoffReason: null
            }
        });

        if (changed.count === 0) {
            return false;
        }

        await LogService.create({
            workspaceId: params.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.AI,
            action: "AI_CONVERSATION_RESUMED",
            message: "Una persona reactivó la IA en esta conversación.",
            payload: {
                conversationId: params.conversationId,
                userId: params.userId
            }
        }).catch(() => undefined);

        emitToWorkspaceAndUsers(
            params.workspaceId,
            [],
            "conversation:ai-resumed",
            {
                conversationId: params.conversationId,
                userId: params.userId
            }
        );

        return true;
    }

    /**
     * Se llama después de un envío humano. No lanza: un fallo al pausar no
     * puede impedir que el mensaje ya enviado se registre.
     */
    static async pauseAfterHumanReply(params: {
        workspaceId: string;
        conversationId: string;
        userId: string | null;
    }): Promise<void> {
        try {
            await this.pauseForHuman({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                userId: params.userId,
                reason: "HUMAN_REPLIED"
            });
        } catch {
            /** La pausa es una salvaguarda: se ignora el fallo puntual. */
        }
    }

    /** Contadores frescos para la política de envío automático. */
    static async countersFor(params: {
        workspaceId: string;
        conversationId: string;
    }): Promise<AutoReplyCounters> {
        const timezone = await SendPolicyService.timezoneFor(params.workspaceId);

        const [repliesToday, repliesInThread, repliesThisMonth, usage] =
            await Promise.all([
            prisma.message.count({
                where: {
                    workspaceId: params.workspaceId,
                    direction: MessageDirection.OUT,
                    source: MessageSource.AUTOMATIC,
                    aiSuggestionId: { not: null },
                    createdAt: { gte: startOfTodayIn(timezone) }
                }
            }),
            prisma.message.count({
                where: {
                    conversationId: params.conversationId,
                    direction: MessageDirection.OUT,
                    source: MessageSource.AUTOMATIC,
                    aiSuggestionId: { not: null }
                }
            }),
            prisma.message.count({
                where: {
                    workspaceId: params.workspaceId,
                    direction: MessageDirection.OUT,
                    source: MessageSource.AUTOMATIC,
                    aiSuggestionId: { not: null },
                    createdAt: { gte: startOfMonthIn(timezone) }
                }
            }),
            prisma.aiUsage.aggregate({
                where: {
                    workspaceId: params.workspaceId,
                    createdAt: { gte: startOfMonthIn(timezone) }
                },
                _sum: { costMicros: true }
            })
        ]);

        return {
            repliesToday,
            repliesInThread,
            repliesThisMonth,
            spentMicrosThisMonth: usage._sum.costMicros || 0
        };
    }

    /**
     * Entrega el hilo a una persona: asigna al agente con menos carga,
     * deja el motivo en la conversación, avisa por socket y lo audita.
     *
     * No lanza: si no hay agentes disponibles, la conversación queda como
     * estaba y el aviso igual se muestra en la bandeja.
     *
     * `pause` (por defecto `true`) aparta a la IA del hilo: una entrega por
     * duda, queja o fallo de envío no debe seguir respondiendo sola. Se pone
     * en `false` cuando la causa es capacidad (límite diario o presupuesto):
     * ahí solo hace falta una persona, y la IA puede volver cuando el límite
     * se renueve.
     */
    static async handoff(params: {
        workspaceId: string;
        conversationId: string;
        reason: string;
        detail?: string | null;
        pause?: boolean;
    }): Promise<void> {
        const now = new Date();
        const pause = params.pause !== false;

        try {
            /**
             * Si ya estaba pausada por una persona, se conserva quién y
             * cuándo: la auditoría de la pausa original no se pisa.
             */
            if (pause) {
                await prisma.conversation.updateMany({
                    where: {
                        id: params.conversationId,
                        workspaceId: params.workspaceId,
                        aiPausedAt: null
                    },
                    data: {
                        aiPausedAt: now,
                        aiPausedById: null
                    }
                });
            }

            await prisma.conversation.updateMany({
                where: {
                    id: params.conversationId,
                    workspaceId: params.workspaceId
                },
                data: {
                    aiHandoffAt: now,
                    aiHandoffReason: params.reason
                }
            });

            await AssignmentService.assignLeastBusyAgent({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId
            }).catch(() => undefined);

            /** Notificación a quien recibe la entrega: toast + badge. */
            const assigned = await prisma.conversation.findFirst({
                where: { id: params.conversationId, workspaceId: params.workspaceId },
                select: {
                    assignedUserId: true,
                    contact: {
                        select: { customName: true, profileName: true, phone: true }
                    }
                }
            });

            const contactName = assigned
                ? assigned.contact.customName ||
                  assigned.contact.profileName ||
                  assigned.contact.phone
                : null;

            emitToWorkspaceAndUsers(
                params.workspaceId,
                [assigned?.assignedUserId ?? null],
                "conversation:handoff",
                {
                    conversationId: params.conversationId,
                    contactName,
                    reason: params.reason,
                    assignedUserId: assigned?.assignedUserId ?? null
                }
            );

            if (assigned?.assignedUserId) {
                await LogService.create({
                    workspaceId: params.workspaceId,
                    level: LogLevel.INFO,
                    module: LogModule.AI,
                    action: "AI_HANDOFF_NOTIFIED",
                    message: "Se notificó la entrega a la persona asignada.",
                    payload: {
                        conversationId: params.conversationId,
                        userId: assigned.assignedUserId,
                        channel: "toast+badge"
                    }
                }).catch(() => undefined);
            }

            await LogService.create({
                workspaceId: params.workspaceId,
                level: LogLevel.WARN,
                module: LogModule.AI,
                action: "AI_HANDOFF",
                message: "La IA entregó la conversación a una persona.",
                payload: {
                    conversationId: params.conversationId,
                    reason: params.reason,
                    detail: params.detail || null,
                    aiPaused: pause
                }
            });

            emitToWorkspaceAndUsers(
                params.workspaceId,
                [],
                "conversation:ai-handoff",
                {
                    conversationId: params.conversationId,
                    reason: params.reason,
                    aiPaused: pause
                }
            );
        } catch {
            /** La entrega no debe tumbar el worker. */
        }
    }
}
