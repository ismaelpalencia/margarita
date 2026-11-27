import {
    LogLevel,
    LogModule,
    UserRole,
    UserStatus
} from "@prisma/client";

import { prisma } from "../config/prisma";
import { LogService } from "./log.service";
import { MessageService } from "./message.service";

export class AgentAbsenceReplyService {
    static async hasAvailableStaff(workspaceId: string, whatsappNumberId: string) {
        const now = new Date();
        const [agent, admin] = await Promise.all([
            prisma.user.findFirst({
                where: {
                    workspaceId,
                    role: UserRole.AGENT,
                    isActive: true,
                    status: { in: [UserStatus.AVAILABLE, UserStatus.BUSY] },
                    OR: [
                        { allowedNumberIds: { isEmpty: true } },
                        { allowedNumberIds: { has: whatsappNumberId } }
                    ]
                },
                select: { id: true }
            }),
            prisma.user.findFirst({
                where: {
                    workspaceId,
                    role: UserRole.ADMIN,
                    isActive: true,
                    sessions: { some: { isActive: true, expiresAt: { gt: now } } }
                },
                select: { id: true }
            })
        ]);

        return Boolean(agent || admin);
    }

    static async handle(params: {
        workspaceId: string;
        conversationId: string;
        inboundMessageId: string;
        replyMessage: string | null;
        intervalHours: number;
    }): Promise<boolean> {
        const body = params.replyMessage?.trim();
        if (!body) return false;

        const conversation = await prisma.conversation.findFirst({
            where: { id: params.conversationId, workspaceId: params.workspaceId },
            select: { lastAgentAbsenceReplyAt: true }
        });
        if (!conversation) return false;

        const now = new Date();
        const lastReply = conversation.lastAgentAbsenceReplyAt;
        if (
            lastReply &&
            now.getTime() - lastReply.getTime() < params.intervalHours * 60 * 60 * 1000
        ) {
            return false;
        }

        const sent = await MessageService.sendAutomaticTextReply({
            workspaceId: params.workspaceId,
            conversationId: params.conversationId,
            body,
            kind: "AGENT_ABSENCE"
        });

        await prisma.conversation.update({
            where: { id: params.conversationId },
            data: { lastAgentAbsenceReplyAt: now }
        });

        await LogService.create({
            workspaceId: params.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.MESSAGE,
            action: "AGENT_ABSENCE_REPLY_SENT",
            message: "Se envió la respuesta automática porque no había agentes disponibles.",
            payload: {
                conversationId: params.conversationId,
                inboundMessageId: params.inboundMessageId,
                messageId: sent.id,
                intervalHours: params.intervalHours
            }
        }).catch(() => undefined);

        return true;
    }
}
