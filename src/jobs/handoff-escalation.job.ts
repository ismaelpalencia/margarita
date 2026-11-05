import { ConversationStatus, LogLevel, LogModule } from "@prisma/client";

import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { emitToWorkspace } from "../sockets";
import { BadgeService } from "../services/badge.service";
import { LogService } from "../services/log.service";

export const escalationState = {
    lastRunAt: null as Date | null,
    lastEscalated: 0
};

const INTERVAL_MS = 60 * 1000;

/**
 * Conversaciones sin asignar que ya superaron el umbral del workspace se
 * escalan una sola vez (handoffEscalatedAt) y se avisa a los administradores.
 */
export async function runHandoffEscalation() {
    const candidates = await prisma.conversation.findMany({
        where: {
            assignedUserId: null,
            status: ConversationStatus.OPEN,
            handoffEscalatedAt: null
        },
        select: {
            id: true,
            workspaceId: true,
            updatedAt: true,
            workspace: { select: { handoffEscalationMinutes: true } }
        }
    });

    const now = new Date();
    let escalated = 0;

    for (const conversation of candidates) {
        const minutes = conversation.workspace.handoffEscalationMinutes || 15;
        const threshold = new Date(now.getTime() - minutes * 60 * 1000);

        if (conversation.updatedAt > threshold) {
            continue;
        }

        await prisma.conversation.update({
            where: { id: conversation.id },
            data: { handoffEscalatedAt: now }
        });

        await LogService.create({
            workspaceId: conversation.workspaceId,
            level: LogLevel.WARN,
            module: LogModule.CONVERSATION,
            action: "HANDOFF_ESCALATED",
            message: "La conversación sin asignar se escaló a los administradores.",
            payload: { conversationId: conversation.id, minutes }
        }).catch(() => undefined);

        emitToWorkspace(conversation.workspaceId, "conversation:escalated", {
            conversationId: conversation.id
        });

        await BadgeService.broadcast(conversation.workspaceId);

        escalated += 1;
    }

    escalationState.lastRunAt = now;
    escalationState.lastEscalated = escalated;

    if (escalated > 0) {
        logger.info({ escalated }, "Escalamiento de handoff aplicado");
    }

    return escalated;
}

export function startHandoffEscalationJob() {
    const timer = setInterval(() => {
        void runHandoffEscalation().catch((error) => {
            logger.error({ error }, "Falló el escalamiento de handoff");
        });
    }, INTERVAL_MS);

    timer.unref?.();

    return timer;
}