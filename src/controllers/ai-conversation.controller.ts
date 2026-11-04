import { Request, Response } from "express";
import { UserRole } from "@prisma/client";

import { prisma } from "../config/prisma";
import { AiAutoReplyService } from "../services/ai/auto-reply.service";
import { getRequiredParam } from "../utils/request";

/**
 * Interruptor de IA por conversación.
 *
 * La IA automática se aparta cuando una persona toma el hilo. Este control
 * permite lo contrario: pausarla antes de que conteste, o reactivarla cuando
 * el equipo ya terminó la parte sensible.
 */
export class AiConversationController {
    private static async conversationFor(
        req: Request,
        conversationId: string
    ) {
        return prisma.conversation.findFirst({
            where: {
                id: conversationId,
                workspaceId: req.user!.workspaceId,
                ...(req.user!.role === UserRole.AGENT
                    ? { assignedUserId: req.user!.id }
                    : {})
            },
            select: { id: true }
        });
    }

    static pause(basePath: string) {
        return async (req: Request, res: Response) => {
            const conversationId = getRequiredParam(req, "id");

            try {
                const conversation = await this.conversationFor(
                    req,
                    conversationId
                );

                if (!conversation) {
                    return res.redirect(`${basePath}?error=not_found`);
                }

                await AiAutoReplyService.pauseForHuman({
                    workspaceId: req.user!.workspaceId,
                    conversationId,
                    userId: req.user!.id,
                    reason: "MANUAL"
                });

                return res.redirect(
                    `${basePath}/${conversationId}?success=ai_paused`
                );
            } catch {
                return res.redirect(
                    `${basePath}/${conversationId}?error=ai_pause`
                );
            }
        };
    }

    static resume(basePath: string) {
        return async (req: Request, res: Response) => {
            const conversationId = getRequiredParam(req, "id");

            try {
                const conversation = await this.conversationFor(
                    req,
                    conversationId
                );

                if (!conversation) {
                    return res.redirect(`${basePath}?error=not_found`);
                }

                await AiAutoReplyService.resume({
                    workspaceId: req.user!.workspaceId,
                    conversationId,
                    userId: req.user!.id
                });

                return res.redirect(
                    `${basePath}/${conversationId}?success=ai_resumed`
                );
            } catch {
                return res.redirect(
                    `${basePath}/${conversationId}?error=ai_pause`
                );
            }
        };
    }
}
