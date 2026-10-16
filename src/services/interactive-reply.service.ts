import {
    ContactOutcomeType,
    LogLevel,
    LogModule,
    ReplyEffect
} from "@prisma/client";

import { prisma } from "../config/prisma";
import { LogService } from "./log.service";
import { ContactService } from "./contact.service";
import { ContactOutcomeService } from "./contact-outcome.service";

/**
 * Fase 3: el puente entre lo que el deudor toca y lo que la herramienta
 * registra.
 *
 * Un botón no es un adorno: es una respuesta estructurada. Aquí se traduce al
 * resultado de gestión que ya existe (el mismo catálogo que usa el equipo a
 * mano) y, cuando corresponde, se dispara el efecto que ya está probado:
 *
 * - **Pago reportado**: «ya pagué» **no** se marca como pagado. Entra como
 *   `REPORTED_PAYMENT` (pendiente de conciliar) para no reportar como
 *   recuperación algo que nadie verificó.
 * - **Cuenta en disputa**: pausa el contacto —no se le escribe— y deja el
 *   incidente con nivel de error, que es lo que dispara las alertas externas.
 * - **Baja**: registra la baja el mismo día, sin depender de la palabra clave.
 *
 * La tabla es editable porque cada operación cobra distinto y porque Meta no
 * siempre devuelve un identificador propio en el botón: por eso se puede mapear
 * por `id` **o** por el texto que el deudor vio en pantalla.
 */

export type ReplyRuleInput = {
    replyId: string;
    replyTitle?: string | null;
    outcomeType: ContactOutcomeType;
    effect?: ReplyEffect;
    note?: string | null;
    isActive?: boolean;
};

/**
 * Las reglas que sirven para la plantilla de cobranza acordada (dos botones) y
 * para las respuestas que ya llegan hoy. Se crean de un clic desde el panel y
 * quedan editables.
 */
export const RECOMMENDED_REPLY_RULES: Array<{
    replyId: string;
    replyTitle: string;
    outcomeType: ContactOutcomeType;
    effect: ReplyEffect;
    note: string;
}> = [
    {
        replyId: "YA_PAGUE",
        replyTitle: "Ya pagué",
        outcomeType: ContactOutcomeType.REPORTED_PAYMENT,
        effect: ReplyEffect.NONE,
        note: "Entra como pago reportado: hay que confirmarlo antes de darlo por cobrado."
    },
    {
        replyId: "LLAMARME",
        replyTitle: "Quiero que me llame un asesor",
        outcomeType: ContactOutcomeType.CALLBACK,
        effect: ReplyEffect.NONE,
        note: "Pidió que lo llamen: es la mayor intención de pago de la cartera."
    },
    {
        replyId: "NECESITO_PLAZO",
        replyTitle: "Necesito plazo",
        outcomeType: ContactOutcomeType.CALLBACK,
        effect: ReplyEffect.NONE,
        note: "Quiere negociar: se trabaja con llamada."
    },
    {
        replyId: "NO_RECONOZCO",
        replyTitle: "No reconozco la deuda",
        outcomeType: ContactOutcomeType.DISPUTED,
        effect: ReplyEffect.PAUSE_ACCOUNT,
        note: "Se pausa y se revisa con el acreedor antes de volver a escribirle."
    },
    {
        replyId: "NO_CONTACTAR",
        replyTitle: "No quiero ser contactado",
        outcomeType: ContactOutcomeType.NOT_INTERESTED,
        effect: ReplyEffect.OPT_OUT,
        note: "Pide la baja: se registra el mismo día."
    },
    {
        replyId: "NUMERO_INVALIDO",
        replyTitle: "Número equivocado",
        outcomeType: ContactOutcomeType.WRONG_NUMBER,
        effect: ReplyEffect.NONE,
        note: "Para depurar el dato con el acreedor."
    }
];

export type AppliedReplyRule = {
    ruleId: string;
    replyId: string;
    outcomeType: ContactOutcomeType;
    effect: ReplyEffect;
};

export class InteractiveReplyService {
    static async list(workspaceId: string) {
        return prisma.interactiveReplyRule.findMany({
            where: { workspaceId },
            orderBy: [{ isActive: "desc" }, { replyId: "asc" }]
        });
    }

    static async save(workspaceId: string, input: ReplyRuleInput) {
        const replyId = input.replyId.trim().toUpperCase();

        if (replyId === "") {
            throw new Error("Escribe el identificador que manda el botón.");
        }

        return prisma.interactiveReplyRule.upsert({
            where: {
                workspaceId_replyId: { workspaceId, replyId }
            },
            update: {
                replyTitle: input.replyTitle?.trim() || null,
                outcomeType: input.outcomeType,
                effect: input.effect ?? ReplyEffect.NONE,
                note: input.note?.trim() || null,
                isActive: input.isActive ?? true
            },
            create: {
                workspaceId,
                replyId,
                replyTitle: input.replyTitle?.trim() || null,
                outcomeType: input.outcomeType,
                effect: input.effect ?? ReplyEffect.NONE,
                note: input.note?.trim() || null,
                isActive: input.isActive ?? true
            }
        });
    }

    static async setActive(workspaceId: string, id: string, isActive: boolean) {
        await prisma.interactiveReplyRule.updateMany({
            where: { id, workspaceId },
            data: { isActive }
        });
    }

    static async remove(workspaceId: string, id: string) {
        await prisma.interactiveReplyRule.deleteMany({
            where: { id, workspaceId }
        });
    }

    /** Crea (o refresca) el juego de reglas recomendado para cobranza. */
    static async createRecommended(workspaceId: string) {
        for (const rule of RECOMMENDED_REPLY_RULES) {
            await prisma.interactiveReplyRule.upsert({
                where: {
                    workspaceId_replyId: {
                        workspaceId,
                        replyId: rule.replyId
                    }
                },
                /** Las que ya existen no se pisan: si el despacho las editó, se respeta. */
                update: {
                    replyTitle: rule.replyTitle
                },
                create: {
                    workspaceId,
                    replyId: rule.replyId,
                    replyTitle: rule.replyTitle,
                    outcomeType: rule.outcomeType,
                    effect: rule.effect,
                    note: rule.note,
                    isActive: true
                }
            });
        }

        return RECOMMENDED_REPLY_RULES.length;
    }

    /**
     * Aplica la regla de una respuesta. Primero por el `id` del botón y, si no
     * hay, por el texto que el deudor vio (que es la defensa por si Meta no
     * manda identificador propio).
     */
    static async apply(params: {
        workspaceId: string;
        contactId: string;
        conversationId?: string | null;
        messageId?: string | null;
        replyId: string;
        replyTitle?: string | null;
    }): Promise<AppliedReplyRule | null> {
        const { workspaceId, contactId } = params;

        const rule =
            (await prisma.interactiveReplyRule.findFirst({
                where: {
                    workspaceId,
                    isActive: true,
                    replyId: params.replyId
                }
            })) ||
            (params.replyTitle
                ? await prisma.interactiveReplyRule.findFirst({
                      where: {
                          workspaceId,
                          isActive: true,
                          replyTitle: {
                              equals: params.replyTitle.trim(),
                              mode: "insensitive"
                          }
                      }
                  })
                : null);

        if (!rule) {
            /**
             * Sin regla no se inventa nada, pero tampoco se pierde: queda dicho
             * que esa respuesta no está mapeada, con su identificador, para que
             * se pueda agregar en un minuto.
             */
            await LogService.create({
                workspaceId,
                level: LogLevel.INFO,
                module: LogModule.MESSAGE,
                action: "INTERACTIVE_REPLY_UNMAPPED",
                message:
                    "El cliente respondió con un botón que todavía no tiene regla.",
                payload: {
                    contactId,
                    conversationId: params.conversationId ?? null,
                    messageId: params.messageId ?? null,
                    replyId: params.replyId,
                    replyTitle: params.replyTitle ?? null
                }
            });

            return null;
        }

        /**
         * Se registra con el mismo servicio que usa el equipo a mano: además
         * del historial, deja al día el **estado vigente** del contacto, que es
         * lo que leen la lista del día, los filtros de Contactos y los reportes.
         * El autor va nulo porque no hay persona detrás: lo puso el deudor.
         */
        await ContactOutcomeService.mark({
            workspaceId,
            contactIds: [contactId],
            userId: null,
            type: rule.outcomeType,
            conversationId: params.conversationId ?? null,
            note: [
                `Registrado por el deudor al tocar «${
                    params.replyTitle || rule.replyTitle || rule.replyId
                }»`,
                rule.note
            ]
                .filter(Boolean)
                .join(". "),
            source: "INTERACTIVE"
        });

        if (rule.effect === ReplyEffect.OPT_OUT) {
            await ContactService.setOptOut(workspaceId, contactId, "button");
        }

        if (rule.effect === ReplyEffect.PAUSE_ACCOUNT) {
            const reason =
                rule.note?.trim() ||
                `El deudor respondió «${params.replyTitle || rule.replyId}»`;

            await prisma.contact.update({
                where: { id: contactId },
                data: {
                    pausedAt: new Date(),
                    pausedReason: reason
                }
            });
        }

        await LogService.create({
            /**
             * El registro va con su empresa: sin esto la bitácora no lo muestra
             * en el panel (y el incidente se perdería donde nadie lo mira).
             */
            workspaceId,
            /**
             * La pausa se registra como error a propósito: es lo que dispara la
             * alerta externa, y una cuenta en disputa la tiene que ver alguien
             * hoy, no al cierre del mes.
             */
            level:
                rule.effect === ReplyEffect.PAUSE_ACCOUNT
                    ? LogLevel.ERROR
                    : LogLevel.INFO,
            module: LogModule.CONTACT,
            action: "INTERACTIVE_RULE_APPLIED",
            message:
                rule.effect === ReplyEffect.PAUSE_ACCOUNT
                    ? "El deudor no reconoce la deuda: la cuenta quedó en pausa."
                    : rule.effect === ReplyEffect.OPT_OUT
                      ? "El deudor pidió la baja al tocar un botón."
                      : "Se registró el resultado de gestión de una respuesta de botón.",
            payload: {
                contactId,
                conversationId: params.conversationId ?? null,
                messageId: params.messageId ?? null,
                ruleId: rule.id,
                replyId: rule.replyId,
                replyTitle: params.replyTitle ?? rule.replyTitle,
                outcomeType: rule.outcomeType,
                effect: rule.effect
            }
        });

        return {
            ruleId: rule.id,
            replyId: rule.replyId,
            outcomeType: rule.outcomeType,
            effect: rule.effect
        };
    }
}
