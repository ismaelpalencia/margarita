import { AiSuggestionStatus } from "@prisma/client";
import { Request, Response } from "express";

import { AiSuggestionService } from "../services/ai/suggestion.service";
import { getRequiredParam } from "../utils/request";

/**
 * Decisiones sobre un borrador de IA desde la bandeja.
 *
 * Se comparte entre admin y agente porque la acción es la misma; lo único
 * que cambia es a dónde se regresa. Usar el borrador no envía nada: solo
 * lo marca y precarga el compositor para que una persona lo revise.
 */
export class AiSuggestionController {
    private static async decide(
        req: Request,
        res: Response,
        params: {
            basePath: string;
            status:
                | "ACCEPTED"
                | "DISCARDED";
        }
    ) {
        const conversationId = getRequiredParam(req, "id");
        const suggestionId = getRequiredParam(req, "suggestionId");

        try {
            await AiSuggestionService.markDecided({
                workspaceId: req.user!.workspaceId,
                conversationId,
                suggestionId,
                status: params.status,
                userId: req.user!.id
            });

            if (params.status === AiSuggestionStatus.DISCARDED) {
                return res.redirect(
                    `${params.basePath}/${conversationId}?success=ai_discarded`
                );
            }

            /**
             * El id viaja en la URL para precargar el compositor con el
             * texto exacto que se aprobó. No es información sensible y
             * evita guardar estado de sesión para algo tan corto.
             */
            return res.redirect(
                `${params.basePath}/${conversationId}?ai=${encodeURIComponent(
                    suggestionId
                )}`
            );
        } catch {
            return res.redirect(
                `${params.basePath}/${conversationId}?error=ai`
            );
        }
    }

    static use(basePath: string) {
        return (req: Request, res: Response) =>
            AiSuggestionController.decide(req, res, {
                basePath,
                status: AiSuggestionStatus.ACCEPTED
            });
    }

    static discard(basePath: string) {
        return (req: Request, res: Response) =>
            AiSuggestionController.decide(req, res, {
                basePath,
                status: AiSuggestionStatus.DISCARDED
            });
    }
}
