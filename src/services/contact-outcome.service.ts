import {
    ContactOutcomeType,
    LogLevel,
    LogModule,
    Prisma
} from "@prisma/client";

import { prisma } from "../config/prisma";
import { OUTCOME_LABELS, parseAmount, parseDueDate } from "../utils/outcome";
import { LogService } from "./log.service";
import { SendPolicyService } from "./send-policy.service";

export type MarkOutcomeInput = {
    workspaceId: string;
    /** Uno o varios contactos: el marcado en bloque usa la misma ruta. */
    contactIds: string[];
    /**
     * Quién lo marca. Es nulo cuando lo registra el sistema: una respuesta de
     * botón no la escribió una persona, y el historial lo dice así.
     */
    userId: string | null;
    type: ContactOutcomeType;
    note?: string | null;
    /** Monto tal como lo escribió la persona ("1,250.00"). */
    amount?: string | null;
    /** Fecha compromiso, "YYYY-MM-DD". */
    dueDate?: string | null;
    /** Fecha en que pagó, "YYYY-MM-DD". */
    paidDate?: string | null;
    conversationId?: string | null;
    source?: "PANEL" | "BULK" | "INTERACTIVE";
};

export type ContactAttempts = {
    /** Mensajes salientes que sí salieron después del último entrante. */
    attempts: number;
    /** Si el cliente ha respondido alguna vez. */
    hasInbound: boolean;
    lastInboundAt: Date | null;
};

export type OutcomeHistoryItem = {
    id: string;
    type: ContactOutcomeType;
    note: string | null;
    amount: number | null;
    dueAt: Date | null;
    paidAt: Date | null;
    source: string;
    createdAt: Date;
    userName: string | null;
};

const TYPES_REQUIRING_DUE_DATE: ContactOutcomeType[] = [
    ContactOutcomeType.PROMISE,
    ContactOutcomeType.CONVENIO
];

/**
 * Error que sí puede corregir quien está marcando (faltó una fecha, el monto
 * no se entiende). Los controladores lo muestran como aviso en la pantalla;
 * cualquier otro error se trata como falla del sistema.
 */
export class OutcomeValidationError extends Error {}

/**
 * Resultado de la gestión con un cliente.
 *
 * Dos reglas que valen la pena tener presentes:
 *
 * - **La promesa incumplida no se guarda sola.** Una promesa vencida se
 *   deduce de la fecha compromiso mientras siga abierta (`isOverdue`), así
 *   que si el cliente paga después, marcar `PAID` la resuelve sin deshacer
 *   nada. `PROMISE_BROKEN` es para cuando una persona confirma el
 *   incumplimiento.
 * - **El historial no se toca.** Cada marcado agrega un renglón; el estado
 *   vigente se copia a `Contact` para poder filtrar y reportar rápido.
 */
export class ContactOutcomeService {
    static async mark(input: MarkOutcomeInput): Promise<number> {
        const contactIds = [...new Set(input.contactIds.filter(Boolean))];

        if (contactIds.length === 0) {
            throw new OutcomeValidationError("Selecciona al menos un contacto.");
        }

        const timezone = await SendPolicyService.timezoneFor(input.workspaceId);

        const dueAt = TYPES_REQUIRING_DUE_DATE.includes(input.type)
            ? parseDueDate(input.dueDate, timezone)
            : null;

        if (TYPES_REQUIRING_DUE_DATE.includes(input.type) && !dueAt) {
            throw new OutcomeValidationError(
                "Una promesa o un convenio necesita fecha compromiso."
            );
        }

        if (input.amount && input.amount.trim() !== "") {
            if (parseAmount(input.amount) === null) {
                throw new OutcomeValidationError(
                    "El monto no se entiende. Escríbelo como 1250 o 1,250.00."
                );
            }
        }

        const amount = parseAmount(input.amount);

        const paidAt =
            input.type === ContactOutcomeType.PAID
                ? parseDueDate(input.paidDate, timezone) ?? new Date()
                : null;

        /** Solo se aceptan contactos de esta empresa. */
        const contacts = await prisma.contact.findMany({
            where: {
                id: { in: contactIds },
                workspaceId: input.workspaceId
            },
            select: { id: true, outcomeType: true, outcomeAt: true }
        });

        if (contacts.length === 0) {
            throw new OutcomeValidationError("No se encontraron los contactos.");
        }

        const note = input.note?.trim() || null;
        const amountText = amount === null ? null : String(amount);
        const now = new Date();

        for (const contact of contacts) {
            const previous = contact.outcomeType
                ? OUTCOME_LABELS[contact.outcomeType]
                : "sin resultado";

            /**
             * Primero el historial y después el estado vigente: si algo
             * fallara entre los dos pasos, lo peor que queda es un estado
             * viejo en `Contact`, y el historial permite reconstruirlo.
             */
            await prisma.contactOutcome.create({
                data: {
                    workspaceId: input.workspaceId,
                    contactId: contact.id,
                    conversationId: input.conversationId || null,
                    createdById: input.userId,
                    type: input.type,
                    note,
                    amount: amountText,
                    dueAt,
                    paidAt,
                    source: input.source || "PANEL"
                }
            });

            await prisma.contact.update({
                where: {
                    id: contact.id
                },
                data: {
                    outcomeType: input.type,
                    outcomeAt: now,
                    outcomeById: input.userId,
                    outcomeAmount: amountText,
                    /** Un pago cierra la promesa: ya no hay nada que vencer. */
                    outcomeDueAt:
                        input.type === ContactOutcomeType.PAID ? null : dueAt,
                    outcomePaidAt: paidAt
                }
            });

            await LogService.create({
                workspaceId: input.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.CONTACT,
                action: "CONTACT_OUTCOME_MARKED",
                message: `Resultado de gestión: ${OUTCOME_LABELS[input.type]}.`,
                payload: {
                    contactId: contact.id,
                    type: input.type,
                    previous,
                    amount,
                    dueAt: dueAt ? dueAt.toISOString().slice(0, 10) : null,
                    paidAt: paidAt ? paidAt.toISOString().slice(0, 10) : null,
                    source: input.source || "PANEL"
                }
            });
        }

        return contacts.length;
    }

    static async historyFor(
        workspaceId: string,
        contactId: string,
        limit = 30
    ): Promise<OutcomeHistoryItem[]> {
        const rows = await prisma.contactOutcome.findMany({
            where: {
                workspaceId,
                contactId
            },
            orderBy: {
                createdAt: "desc"
            },
            take: limit,
            include: {
                createdBy: {
                    select: {
                        name: true
                    }
                }
            }
        });

        return rows.map((row) => ({
            id: row.id,
            type: row.type,
            note: row.note,
            amount: parseAmount(row.amount),
            dueAt: row.dueAt,
            paidAt: row.paidAt,
            source: row.source,
            createdAt: row.createdAt,
            userName: row.createdBy?.name ?? null
        }));
    }

    /**
     * Intentos por cliente: mensajes salientes que sí salieron después del
     * último mensaje entrante. Se calcula, no se captura, y una respuesta
     * del cliente reinicia el contador (eso es un contacto efectivo).
     *
     * Se hace con SQL porque es una comparación contra el máximo de cada
     * conversación, algo que `groupBy` no puede expresar.
     */
    static async attemptsFor(
        workspaceId: string,
        contactIds?: string[]
    ): Promise<Map<string, ContactAttempts>> {
        const filterByIds = contactIds && contactIds.length > 0;

        /**
         * Se cuentan por **contacto**, no por hilo: da igual por cuál de
         * sus números se le escribió, lo que importa es si contestó.
         */
        const attempts = await prisma.$queryRaw<
            Array<{
                contactId: string;
                attempts: number;
                lastInboundAt: Date | null;
            }>
        >`
            WITH incoming AS (
                SELECT c."contactId" AS contact_id, MAX(m."createdAt") AS last_in
                  FROM "Message" m
                  JOIN "Conversation" c ON c.id = m."conversationId"
                 WHERE m."direction" = 'IN'
                   AND m."workspaceId" = ${workspaceId}
                   ${filterByIds ? Prisma.sql`AND c."contactId" IN (${Prisma.join(contactIds)})` : Prisma.empty}
                 GROUP BY 1
            ),
            outgoing AS (
                SELECT c."contactId" AS contact_id, m."createdAt" AS sent_at
                  FROM "Message" m
                  JOIN "Conversation" c ON c.id = m."conversationId"
                 WHERE m."direction" = 'OUT'
                   AND m."workspaceId" = ${workspaceId}
                   AND m."isInternalNote" = false
                   AND m."status" <> 'FAILED'
                   ${filterByIds ? Prisma.sql`AND c."contactId" IN (${Prisma.join(contactIds)})` : Prisma.empty}
            )
            SELECT o.contact_id AS "contactId",
                   COUNT(*)::int AS "attempts",
                   i.last_in AS "lastInboundAt"
              FROM outgoing o
              LEFT JOIN incoming i ON i.contact_id = o.contact_id
             WHERE i.last_in IS NULL OR o.sent_at > i.last_in
             GROUP BY o.contact_id, i.last_in
        `;

        const result = new Map<string, ContactAttempts>();

        for (const row of attempts) {
            result.set(row.contactId, {
                attempts: Number(row.attempts) || 0,
                hasInbound: false,
                lastInboundAt: null
            });
        }

        /**
         * Quien no acumula intentos no aparece en la consulta anterior, y
         * los llamadores necesitan saber de todos modos si ha respondido.
         * Cuando se pidió una lista concreta de contactos, se completa.
         */
        if (filterByIds) {
            const inbound = await prisma.$queryRaw<
                Array<{ contactId: string; lastInboundAt: Date | null }>
            >`
                SELECT c."contactId" AS "contactId",
                       MAX(m."createdAt") AS "lastInboundAt"
                  FROM "Message" m
                  JOIN "Conversation" c ON c.id = m."conversationId"
                 WHERE m."direction" = 'IN'
                   AND m."workspaceId" = ${workspaceId}
                   AND c."contactId" IN (${Prisma.join(contactIds)})
                 GROUP BY 1
            `;

            for (const row of inbound) {
                const current = result.get(row.contactId) ?? {
                    attempts: 0,
                    hasInbound: false,
                    lastInboundAt: null
                };

                result.set(row.contactId, {
                    ...current,
                    hasInbound: row.lastInboundAt !== null,
                    lastInboundAt: row.lastInboundAt
                });
            }

            /** Los que no aparecieron en ninguna consulta también cuentan. */
            for (const contactId of contactIds) {
                if (!result.has(contactId)) {
                    result.set(contactId, {
                        attempts: 0,
                        hasInbound: false,
                        lastInboundAt: null
                    });
                }
            }
        } else {
            /** Sin filtro sí se necesita saber quién respondió alguna vez. */
            const inbound = await prisma.$queryRaw<
                Array<{ contactId: string }>
            >`
                SELECT DISTINCT c."contactId" AS "contactId"
                  FROM "Message" m
                  JOIN "Conversation" c ON c.id = m."conversationId"
                 WHERE m."direction" = 'IN'
                   AND m."workspaceId" = ${workspaceId}
            `;

            const answered = new Set(inbound.map((row) => row.contactId));

            for (const [contactId, summary] of result) {
                result.set(contactId, {
                    ...summary,
                    hasInbound: answered.has(contactId)
                });
            }
        }

        return result;
    }

}
