import { NextFunction, Request, Response } from "express";

import { ConversationService } from "../services/conversation.service";
import {
    ContactOutcomeService,
    OutcomeValidationError
} from "../services/contact-outcome.service";
import { getRequiredParam } from "../utils/request";
import {
    markOutcomeBulkSchema,
    markOutcomeSchema
} from "../validations/outcome.validation";

/**
 * Marcado del resultado de la gestión.
 *
 * Se usa desde el hilo (admin y agente), desde la ficha del contacto y en
 * bloque desde la lista de contactos. Todo pasa por el mismo servicio, así
 * que el historial y la auditoría quedan iguales sin importar por dónde se
 * marcó.
 */
export class OutcomeController {
    /**
     * Un agente puede intentar marcar un hilo que no es suyo: `Conversation`
     * lo rechaza. Eso es un caso esperado, no una falla del sistema, así que
     * se responde con un aviso en la pantalla y no con un 500.
     */
    private static isNotVisibleConversation(error: unknown): boolean {
        return (
            error instanceof Error &&
            /conversación no encontrada|no asignada a ti/i.test(error.message)
        );
    }

    /**
     * El mismo handler sirve para el panel del admin y el del agente: lo
     * único que cambia es la ruta de regreso y con qué consulta se valida
     * que el hilo sea visible para quien lo marca.
     */
    static markFromConversation(options: {
        basePath: string;
        forAgent: boolean;
    }) {
        return async (req: Request, res: Response, next: NextFunction) => {
            const conversationId = getRequiredParam(req, "id");

            const parsed = markOutcomeSchema.safeParse(req.body);

            if (!parsed.success) {
                return res.redirect(
                    `${options.basePath}/${conversationId}?error=outcome`
                );
            }

            try {
                const conversation = options.forAgent
                    ? await ConversationService.getConversationForAgent(
                          req.user!.workspaceId,
                          req.user!.id,
                          conversationId
                      )
                    : await ConversationService.getConversationForAdmin(
                          req.user!.workspaceId,
                          conversationId
                      );

                await ContactOutcomeService.mark({
                    workspaceId: req.user!.workspaceId,
                    contactIds: [conversation.contactId],
                    conversationId: conversation.id,
                    userId: req.user!.id,
                    type: parsed.data.type,
                    note: parsed.data.note,
                    amount: parsed.data.amount,
                    dueDate: parsed.data.dueDate,
                    paidDate: parsed.data.paidDate
                });

                return res.redirect(
                    `${options.basePath}/${conversationId}?success=outcome`
                );
            } catch (error) {
                if (
                    error instanceof OutcomeValidationError ||
                    OutcomeController.isNotVisibleConversation(error)
                ) {
                    return res.redirect(
                        `${options.basePath}/${conversationId}?error=outcome`
                    );
                }

                return next(error);
            }
        };
    }

    /** Desde la ficha del contacto, con el detalle completo. */
    static async markFromContact(
        req: Request,
        res: Response,
        next: NextFunction
    ) {
        const contactId = getRequiredParam(req, "id");

        const parsed = markOutcomeSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/admin/contacts/${contactId}/edit?error=outcome`
            );
        }

        try {
            await ContactOutcomeService.mark({
                workspaceId: req.user!.workspaceId,
                contactIds: [contactId],
                userId: req.user!.id,
                type: parsed.data.type,
                note: parsed.data.note,
                amount: parsed.data.amount,
                dueDate: parsed.data.dueDate,
                paidDate: parsed.data.paidDate
            });

            return res.redirect(
                `/admin/contacts/${contactId}/edit?success=outcome`
            );
        } catch (error) {
            if (
                error instanceof OutcomeValidationError ||
                OutcomeController.isNotVisibleConversation(error)
            ) {
                return res.redirect(
                    `/admin/contacts/${contactId}/edit?error=outcome`
                );
            }

            return next(error);
        }
    }

    /** En bloque, desde la lista de contactos o desde un reporte. */
    static async markBulk(req: Request, res: Response, next: NextFunction) {
        const parsed = markOutcomeBulkSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect("/admin/contacts?error=outcome");
        }

        /** Se respeta el filtro que estaba viendo la persona. */
        const redirectTo =
            typeof req.body?.redirectTo === "string" &&
            req.body.redirectTo.startsWith("/") &&
            !req.body.redirectTo.startsWith("//")
                ? req.body.redirectTo
                : "/admin/contacts";

        try {
            await ContactOutcomeService.mark({
                workspaceId: req.user!.workspaceId,
                contactIds: parsed.data.contactIds,
                userId: req.user!.id,
                type: parsed.data.type,
                note: parsed.data.note,
                amount: parsed.data.amount,
                dueDate: parsed.data.dueDate,
                paidDate: parsed.data.paidDate,
                source: "BULK"
            });

            return res.redirect(`${redirectTo}${redirectTo.includes("?") ? "&" : "?"}success=outcome`);
        } catch (error) {
            if (
                error instanceof OutcomeValidationError ||
                OutcomeController.isNotVisibleConversation(error)
            ) {
                return res.redirect(
                    `${redirectTo}${redirectTo.includes("?") ? "&" : "?"}error=outcome`
                );
            }

            return next(error);
        }
    }
}
