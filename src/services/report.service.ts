import { ContactOutcomeType, Prisma } from "@prisma/client";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezonePlugin from "dayjs/plugin/timezone";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { startOfTodayIn } from "../utils/date";
import {
    OPEN_PROMISE_TYPES,
    classifyPromises,
    daysOverdue,
    formatAmount,
    isOpenPromise,
    parseAmount
} from "../utils/outcome";
import { ContactOutcomeService } from "./contact-outcome.service";
import { SendPolicyService } from "./send-policy.service";

dayjs.extend(utc);
dayjs.extend(timezonePlugin);

export type ReportFilters = {
    workspaceId: string;
    /** Inicio del rango, ya resuelto a un instante en la zona de la empresa. */
    from: Date;
    /** Fin del rango, exclusivo (medianoche del día siguiente). */
    to: Date;
    fromLabel: string;
    toLabel: string;
    userId?: string;
    campaignId?: string;
    tagId?: string;
    numberId?: string;
};

export type OutcomeRow = {
    id: string;
    type: ContactOutcomeType;
    createdAt: Date;
    note: string | null;
    amount: number | null;
    dueAt: Date | null;
    paidAt: Date | null;
    source: string;
    contactId: string;
    contactName: string;
    contactPhone: string;
    numberId: string | null;
    numberLabel: string | null;
    userName: string | null;
    conversationId: string | null;
};

export type PromiseItem = {
    contactId: string;
    contactName: string;
    contactPhone: string;
    numberId: string | null;
    numberLabel: string | null;
    type: ContactOutcomeType;
    amount: number | null;
    dueAt: Date;
    daysLate: number;
    outcomeAt: Date | null;
    userName: string | null;
};

/**
 * Un cliente que pidió que lo llamen.
 *
 * Es la mayor intención de pago de la cartera —ya dio el paso—, así que va
 * primero en la lista de trabajo y con el tiempo que lleva esperando a la
 * vista: llamar en dos horas convierte mucho mejor que llamar en tres días.
 */
export type CallRequestItem = {
    contactId: string;
    contactName: string;
    contactPhone: string;
    numberId: string | null;
    numberLabel: string | null;
    /** Cuándo lo pidió (el toque del botón o el marcado a mano). */
    requestedAt: Date;
    /** Horas que lleva esperando, para poder priorizar. */
    hoursWaiting: number;
    /** Hora local en que lo pidió, ya formateada para leerla. */
    requestedLocalTime: string;
    /** Lo pidió fuera del horario permitido (8:00 a 21:00). */
    outsideHours: boolean;
    /** De dónde salió: el botón, o alguien del equipo lo marcó. */
    fromButton: boolean;
    /** Cita de llamada, si alguien la agendó. */
    scheduledAt: Date | null;
    /** La cita ya llegó (o pasó): va primero en la lista. */
    scheduledDue: boolean;
    /** Valor para el `<input type="datetime-local">`, en hora local. */
    scheduledInputValue: string;
    /** "17/10/2026 18:00", ya formateada. */
    scheduledLabel: string | null;
};

/** Cuántas filas como máximo se cargan para calcular un reporte. */
const MAX_REPORT_ROWS = 5000;

function numberLabel(number: {
    displayName: string | null;
    phoneNumber: string;
} | null): string | null {
    if (!number) {
        return null;
    }

    return number.displayName
        ? `${number.displayName} · ${number.phoneNumber}`
        : number.phoneNumber;
}

/**
 * Reportes de gestión (cobranza).
 *
 * Dos decisiones que se notan en el código:
 *
 * - Los **montos van cifrados** en la base, así que las sumas se hacen aquí,
 *   en la aplicación, después de descifrar. Nunca con `SUM()` en SQL.
 * - Las fechas y los tipos van en claro, así que el filtro pesado se hace en
 *   la consulta y solo se traen las filas del rango.
 */
export class ReportService {
    /**
     * Rango de fechas del reporte, en la zona horaria de la empresa. Por
     * defecto, los últimos 7 días incluido hoy.
     */
    static async resolveRange(
        workspaceId: string,
        fromParam?: string,
        toParam?: string
    ) {
        const timezone = await SendPolicyService.timezoneFor(workspaceId);
        const today = dayjs().tz(timezone).startOf("day");

        const from = dayjs
            .tz(fromParam || today.subtract(6, "day").format("YYYY-MM-DD"), timezone)
            .startOf("day");
        const to = dayjs
            .tz(toParam || today.format("YYYY-MM-DD"), timezone)
            .startOf("day");

        const safeFrom = from.isValid() ? from : today.subtract(6, "day");
        const safeTo = to.isValid() ? to : today;

        return {
            timezone,
            from: safeFrom.toDate(),
            to: safeTo.add(1, "day").toDate(),
            fromLabel: safeFrom.format("YYYY-MM-DD"),
            toLabel: safeTo.format("YYYY-MM-DD"),
            todayStart: startOfTodayIn(timezone)
        };
    }

    private static async outcomeWhere(
        filters: ReportFilters
    ): Promise<Prisma.ContactOutcomeWhereInput> {
        const contactIds = await this.contactIdsFilter(filters);

        return {
            workspaceId: filters.workspaceId,
            createdAt: {
                gte: filters.from,
                lt: filters.to
            },
            ...(filters.userId ? { createdById: filters.userId } : {}),
            ...(filters.numberId
                ? { conversation: { whatsappNumberId: filters.numberId } }
                : {}),
            ...(contactIds ? { contactId: { in: contactIds } } : {})
        };
    }

    /**
     * Cuando el reporte se filtra por campaña o por etiqueta, primero salen
     * los contactos que cumplen y luego se limita el reporte a ellos.
     */
    private static async contactIdsFilter(
        filters: ReportFilters
    ): Promise<string[] | null> {
        if (!filters.campaignId && !filters.tagId) {
            return null;
        }

        const contacts = await prisma.contact.findMany({
            where: {
                workspaceId: filters.workspaceId,
                ...(filters.campaignId
                    ? { campaignRecipients: { some: { campaignId: filters.campaignId } } }
                    : {}),
                ...(filters.tagId
                    ? { tags: { some: { tagId: filters.tagId } } }
                    : {})
            },
            select: {
                id: true
            }
        });

        return contacts.map((contact) => contact.id);
    }

    /** Una fila por gestión, lista para la tabla y para el CSV. */
    static async detailRows(filters: ReportFilters): Promise<OutcomeRow[]> {
        const rows = await prisma.contactOutcome.findMany({
            where: await this.outcomeWhere(filters),
            orderBy: {
                createdAt: "desc"
            },
            take: MAX_REPORT_ROWS,
            include: {
                contact: {
                    select: {
                        id: true,
                        customName: true,
                        profileName: true,
                        phone: true
                    }
                },
                createdBy: {
                    select: {
                        name: true
                    }
                },
                conversation: {
                    select: {
                        whatsappNumber: {
                            select: {
                                id: true,
                                displayName: true,
                                phoneNumber: true
                            }
                        }
                    }
                }
            }
        });

        return rows.map((row) => ({
            id: row.id,
            type: row.type,
            createdAt: row.createdAt,
            note: row.note,
            amount: parseAmount(row.amount),
            dueAt: row.dueAt,
            paidAt: row.paidAt,
            source: row.source,
            contactId: row.contact.id,
            contactName:
                row.contact.customName ||
                row.contact.profileName ||
                row.contact.phone,
            contactPhone: row.contact.phone,
            numberId: row.conversation?.whatsappNumber.id ?? null,
            numberLabel: numberLabel(
                row.conversation?.whatsappNumber ?? null
            ),
            userName: row.createdBy?.name ?? null,
            conversationId: row.conversationId
        }));
    }

    /** Resumen de gestiones: por resultado, por persona y por día. */
    static async gestiones(filters: ReportFilters, timezone: string) {
        const rows = await this.detailRows(filters);

        const byType = new Map<
            ContactOutcomeType,
            { count: number; amount: number }
        >();
        const byUser = new Map<string, number>();
        const byDay = new Map<string, number>();

        let totalAmount = 0;

        for (const row of rows) {
            const current = byType.get(row.type) ?? { count: 0, amount: 0 };

            current.count += 1;
            current.amount += row.amount ?? 0;
            byType.set(row.type, current);

            totalAmount += row.amount ?? 0;

            const userKey = row.userName || "Sin usuario";

            byUser.set(userKey, (byUser.get(userKey) ?? 0) + 1);

            const dayKey = dayjs(row.createdAt).tz(timezone).format("YYYY-MM-DD");

            byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + 1);
        }

        return {
            rows,
            total: rows.length,
            totalAmount,
            byType: [...byType.entries()]
                .map(([type, value]) => ({ type, ...value }))
                .sort((a, b) => b.count - a.count),
            byUser: [...byUser.entries()]
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count),
            byDay: [...byDay.entries()]
                .map(([day, count]) => ({ day, count }))
                .sort((a, b) => (a.day < b.day ? 1 : -1))
        };
    }

    /**
     * Clientes que pidieron que los llamen.
     *
     * El modelo guarda el **último resultado** en el propio contacto, así que
     * no hay que adivinar: son los que hoy tienen «volver a llamar» y siguen
     * activos, sin baja y sin pausa. En cuanto alguien registra otro resultado,
     * el cliente sale de esta lista solo.
     *
     * Se ordenan por antigüedad —el que lleva más esperando, primero— y se
     * marca el que pidió la llamada fuera del horario permitido (8:00 a 21:00
     * hora de la empresa), porque el horario es una regla de conducta, no una
     * sugerencia.
     */
    static async callRequests(
        workspaceId: string,
        timezone: string
    ): Promise<CallRequestItem[]> {
        const contacts = await prisma.contact.findMany({
            where: {
                workspaceId,
                isActive: true,
                optOutAt: null,
                pausedAt: null,
                outcomeType: ContactOutcomeType.CALLBACK
            },
            select: {
                id: true,
                customName: true,
                profileName: true,
                phone: true,
                outcomeAt: true,
                scheduledCallAt: true,
                outcomes: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        source: true,
                        conversation: {
                            select: {
                                whatsappNumber: {
                                    select: {
                                        id: true,
                                        displayName: true,
                                        phoneNumber: true
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: { outcomeAt: "asc" },
            take: MAX_REPORT_ROWS
        });

        const now = Date.now();

        const items = contacts.map((contact) => {
            const requestedAt = contact.outcomeAt ?? new Date();
            const local = dayjs(requestedAt).tz(timezone);
            const hour = local.hour();

            return {
                contactId: contact.id,
                contactName:
                    contact.customName || contact.profileName || contact.phone,
                contactPhone: contact.phone,
                numberId:
                    contact.outcomes[0]?.conversation?.whatsappNumber.id ?? null,
                numberLabel: numberLabel(
                    contact.outcomes[0]?.conversation?.whatsappNumber ?? null
                ),
                requestedAt,
                hoursWaiting: Math.max(
                    0,
                    Math.round((now - requestedAt.getTime()) / 3600000)
                ),
                requestedLocalTime: local.format("DD/MM/YYYY HH:mm"),
                /** De 8:00 a 21:00, hora de la empresa. */
                outsideHours: hour < 8 || hour >= 21,
                fromButton: contact.outcomes[0]?.source === "INTERACTIVE",
                scheduledAt: contact.scheduledCallAt,
                scheduledDue: Boolean(
                    contact.scheduledCallAt &&
                        contact.scheduledCallAt.getTime() <= now
                ),
                scheduledInputValue: contact.scheduledCallAt
                    ? dayjs(contact.scheduledCallAt)
                          .tz(timezone)
                          .format("YYYY-MM-DDTHH:mm")
                    : "",
                scheduledLabel: contact.scheduledCallAt
                    ? dayjs(contact.scheduledCallAt)
                          .tz(timezone)
                          .format("DD/MM/YYYY HH:mm")
                    : null
            };
        });

        /**
         * Primero lo que ya toca llamar (cita vencida o de esta hora), luego
         * las citas futuras por hora y al final los que pidieron llamada pero
         * siguen sin cita. Dentro de cada grupo, el que lleva más esperando.
         */
        const rank = (item: CallRequestItem) => {
            if (item.scheduledAt && item.scheduledDue) {
                return 0;
            }

            return item.scheduledAt ? 1 : 2;
        };

        return items.sort((a, b) => {
            const byRank = rank(a) - rank(b);

            if (byRank !== 0) {
                return byRank;
            }

            if (a.scheduledAt && b.scheduledAt) {
                return a.scheduledAt.getTime() - b.scheduledAt.getTime();
            }

            return a.requestedAt.getTime() - b.requestedAt.getTime();
        });
    }

    /**
     * Promesas y convenios **vigentes**: es la lista de trabajo de cobranza,
     * ordenada por fecha compromiso, con lo que ya venció arriba.
     */
    static async pendingPromises(
        workspaceId: string,
        todayStart: Date
    ): Promise<{ items: PromiseItem[]; totalAmount: number; overdue: number }> {
        const contacts = await prisma.contact.findMany({
            where: {
                workspaceId,
                isActive: true,
                outcomeType: { in: OPEN_PROMISE_TYPES },
                outcomeDueAt: { not: null }
            },
            select: {
                id: true,
                customName: true,
                profileName: true,
                phone: true,
                outcomeType: true,
                outcomeAmount: true,
                outcomeDueAt: true,
                outcomeAt: true,
                outcomes: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        createdBy: { select: { name: true } },
                        conversation: {
                            select: {
                                whatsappNumber: {
                                    select: {
                                        id: true,
                                        displayName: true,
                                        phoneNumber: true
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: {
                outcomeDueAt: "asc"
            },
            take: MAX_REPORT_ROWS
        });

        const items: PromiseItem[] = contacts.map((contact) => ({
            contactId: contact.id,
            contactName:
                contact.customName || contact.profileName || contact.phone,
            contactPhone: contact.phone,
            numberId:
                contact.outcomes[0]?.conversation?.whatsappNumber.id ?? null,
            numberLabel: numberLabel(
                contact.outcomes[0]?.conversation?.whatsappNumber ?? null
            ),
            type: contact.outcomeType as ContactOutcomeType,
            amount: parseAmount(contact.outcomeAmount),
            dueAt: contact.outcomeDueAt as Date,
            daysLate: daysOverdue(contact.outcomeDueAt, todayStart),
            outcomeAt: contact.outcomeAt,
            userName: contact.outcomes[0]?.createdBy?.name ?? null
        }));

        return {
            items,
            totalAmount: items.reduce((sum, item) => sum + (item.amount ?? 0), 0),
            overdue: items.filter((item) => item.daysLate > 0).length
        };
    }

    /**
     * Cumplimiento de las promesas hechas en el rango: cuántas se pagaron a
     * tiempo, cuántas tarde y cuántas siguen sin pago registrado.
     *
     * La comparación es contra el historial, así que funciona aunque la
     * promesa ya se haya cerrado con un pago posterior.
     */
    static async promiseCompliance(filters: ReportFilters) {
        const promises = await prisma.contactOutcome.findMany({
            where: {
                workspaceId: filters.workspaceId,
                type: { in: OPEN_PROMISE_TYPES },
                createdAt: { gte: filters.from, lt: filters.to },
                ...(filters.userId ? { createdById: filters.userId } : {})
            },
            select: {
                id: true,
                contactId: true,
                type: true,
                amount: true,
                dueAt: true,
                createdAt: true
            },
            take: MAX_REPORT_ROWS
        });

        if (promises.length === 0) {
            return {
                summary: { onTime: 0, late: 0, unpaid: 0, promisedAmount: 0, paidAmount: 0 },
                items: []
            };
        }

        const contactIds = [...new Set(promises.map((promise) => promise.contactId))];

        const payments = await prisma.contactOutcome.findMany({
            where: {
                workspaceId: filters.workspaceId,
                contactId: { in: contactIds },
                type: ContactOutcomeType.PAID
            },
            select: {
                contactId: true,
                amount: true,
                paidAt: true,
                createdAt: true
            },
            orderBy: {
                createdAt: "asc"
            }
        });

        const summary = classifyPromises(
            promises.map((promise) => ({
                id: promise.id,
                contactId: promise.contactId,
                type: promise.type,
                amount: parseAmount(promise.amount),
                dueAt: promise.dueAt,
                createdAt: promise.createdAt
            })),
            payments.map((payment) => ({
                contactId: payment.contactId,
                amount: parseAmount(payment.amount),
                paidAt: payment.paidAt,
                createdAt: payment.createdAt
            }))
        );

        return {
            summary: {
                onTime: summary.onTime,
                late: summary.late,
                unpaid: summary.unpaid,
                promisedAmount: summary.promisedAmount,
                paidAmount: summary.paidAmount
            },
            items: summary.items
        };
    }

    /**
     * Lista de trabajo: clientes con al menos N intentos sin respuesta y sin
     * un resultado que cierre el caso.
     */
    static async noAnswerCandidates(
        workspaceId: string,
        threshold: number
    ): Promise<
        Array<{
            contactId: string;
            name: string;
            phone: string;
            attempts: number;
            hasInbound: boolean;
            outcomeType: ContactOutcomeType | null;
            lastAttemptAt: Date | null;
        }>
    > {
        const attempts = await ContactOutcomeService.attemptsFor(workspaceId);

        const candidates = [...attempts.entries()].filter(
            ([, summary]) => summary.attempts >= threshold
        );

        if (candidates.length === 0) {
            return [];
        }

        const contacts = await prisma.contact.findMany({
            where: {
                workspaceId,
                isActive: true,
                id: { in: candidates.map(([contactId]) => contactId) },
                /**
                 * Se excluyen los casos ya cerrados con un resultado que no
                 * sea "sin contestación": si ya prometió o pagó, no es un
                 * cliente sin responder.
                 */
                OR: [
                    { outcomeType: null },
                    { outcomeType: ContactOutcomeType.NO_ANSWER },
                    { outcomeType: ContactOutcomeType.CALLBACK }
                ]
            },
            select: {
                id: true,
                customName: true,
                profileName: true,
                phone: true,
                outcomeType: true
            }
        });

        const attemptsMap = new Map(candidates);

        return contacts
            .map((contact) => {
                const summary = attemptsMap.get(contact.id)!;

                return {
                    contactId: contact.id,
                    name:
                        contact.customName ||
                        contact.profileName ||
                        contact.phone,
                    phone: contact.phone,
                    attempts: summary.attempts,
                    hasInbound: summary.hasInbound,
                    outcomeType: contact.outcomeType,
                    lastAttemptAt: summary.lastInboundAt
                };
            })
            .sort((a, b) => b.attempts - a.attempts);
    }

    /** Tarjetas del día para el dashboard y para la cabecera de reportes. */
    static async outcomeSummary(workspaceId: string) {
        const timezone = await SendPolicyService.timezoneFor(workspaceId);
        const todayStart = startOfTodayIn(timezone);
        const weekEnd = dayjs(todayStart).add(7, "day").toDate();

        const [
            markedToday,
            overduePromises,
            promisesSoon,
            withoutOutcome,
            paidThisMonth
        ] = await Promise.all([
            prisma.contactOutcome.count({
                where: {
                    workspaceId,
                    createdAt: { gte: todayStart }
                }
            }),

            prisma.contact.count({
                where: {
                    workspaceId,
                    isActive: true,
                    outcomeType: { in: OPEN_PROMISE_TYPES },
                    outcomeDueAt: { lt: todayStart }
                }
            }),

            prisma.contact.count({
                where: {
                    workspaceId,
                    isActive: true,
                    outcomeType: { in: OPEN_PROMISE_TYPES },
                    outcomeDueAt: { gte: todayStart, lt: weekEnd }
                }
            }),

            prisma.contact.count({
                where: {
                    workspaceId,
                    isActive: true,
                    outcomeType: null,
                    conversations: { some: {} }
                }
            }),

            prisma.contactOutcome.findMany({
                where: {
                    workspaceId,
                    type: ContactOutcomeType.PAID,
                    createdAt: {
                        gte: dayjs(todayStart).startOf("month").toDate()
                    }
                },
                select: {
                    amount: true
                }
            })
        ]);

        const paidAmount = paidThisMonth.reduce(
            (sum, row) => sum + (parseAmount(row.amount) ?? 0),
            0
        );

        return {
            markedToday,
            overduePromises,
            promisesSoon,
            withoutOutcome,
            paidThisMonth: paidThisMonth.length,
            paidAmount,
            paidAmountLabel: formatAmount(paidAmount),
            timezone
        };
    }

    static formatAmount(value: number | null | undefined): string {
        return formatAmount(value);
    }

    static isOpenPromise(type: ContactOutcomeType | null | undefined): boolean {
        return isOpenPromise(type);
    }

    /**
     * Lista de trabajo del día: a quién escribirle hoy y por qué.
     *
     * El orden es el de urgencia real: primero las promesas que ya se
     * pasaron, luego lo que vence hoy, después la semana y al final los que
     * llevan varios intentos sin contestar.
     */
    static async todayWorklist(
        workspaceId: string,
        todayStart: Date,
        threshold: number
    ) {
        const timezone = await SendPolicyService.timezoneFor(workspaceId);
        const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
        const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

        const [pending, noAnswer, callRequests] = await Promise.all([
            this.pendingPromises(workspaceId, todayStart),
            this.noAnswerCandidates(workspaceId, threshold),
            /**
             * Los que pidieron que los llamen van primero en la pantalla: ya
             * dieron el paso, así que se trabajan antes del barrido normal.
             */
            this.callRequests(workspaceId, timezone)
        ]);

        return {
            timezone,
            overdue: pending.items.filter((item) => item.daysLate > 0),
            dueToday: pending.items.filter(
                (item) =>
                    item.dueAt >= todayStart && item.dueAt < tomorrowStart
            ),
            dueThisWeek: pending.items.filter(
                (item) => item.dueAt >= tomorrowStart && item.dueAt < weekEnd
            ),
            noAnswer,
            callRequests,
            overdueAmount: pending.items
                .filter((item) => item.daysLate > 0)
                .reduce((sum, item) => sum + (item.amount ?? 0), 0)
        };
    }

    /**
     * Tendencias: cómo se movió la gestión semana a semana y cómo va el
     * cumplimiento de cada persona.
     *
     * Se calcula sobre las gestiones del rango y el historial de promesas y
     * pagos, en la aplicación (los montos están cifrados).
     */
    static async trends(filters: ReportFilters, timezone: string) {
        const [rows, promises, payments, users] = await Promise.all([
            this.detailRows(filters),
            prisma.contactOutcome.findMany({
                where: {
                    workspaceId: filters.workspaceId,
                    type: { in: OPEN_PROMISE_TYPES },
                    createdAt: { gte: filters.from, lt: filters.to }
                },
                select: {
                    id: true,
                    contactId: true,
                    type: true,
                    amount: true,
                    dueAt: true,
                    createdAt: true,
                    createdById: true
                },
                take: MAX_REPORT_ROWS
            }),
            prisma.contactOutcome.findMany({
                where: {
                    workspaceId: filters.workspaceId,
                    type: ContactOutcomeType.PAID
                },
                select: {
                    contactId: true,
                    amount: true,
                    paidAt: true,
                    createdAt: true
                },
                orderBy: { createdAt: "asc" }
            }),
            prisma.user.findMany({
                where: { workspaceId: filters.workspaceId },
                select: { id: true, name: true }
            })
        ]);

        const weekKey = (date: Date) =>
            dayjs(date).tz(timezone).startOf("week").format("YYYY-MM-DD");

        const weeks = new Map<
            string,
            { gestiones: number; promesas: number; prometido: number; pagos: number; cobrado: number }
        >();

        for (const row of rows) {
            const key = weekKey(row.createdAt);
            const current =
                weeks.get(key) ??
                { gestiones: 0, promesas: 0, prometido: 0, pagos: 0, cobrado: 0 };

            current.gestiones += 1;

            if (isOpenPromise(row.type)) {
                current.promesas += 1;
                current.prometido += row.amount ?? 0;
            }

            if (row.type === ContactOutcomeType.PAID) {
                current.pagos += 1;
                current.cobrado += row.amount ?? 0;
            }

            weeks.set(key, current);
        }

        /** Cumplimiento por persona, con la misma regla que el reporte general. */
        const byUser = new Map<
            string,
            {
                name: string;
                onTime: number;
                late: number;
                unpaid: number;
                promisedAmount: number;
                paidAmount: number;
            }
        >();

        const paymentsByContact = payments.map((payment) => ({
            contactId: payment.contactId,
            amount: parseAmount(payment.amount),
            paidAt: payment.paidAt,
            createdAt: payment.createdAt
        }));

        const userIds = [...new Set(promises.map((promise) => promise.createdById))];

        for (const userId of userIds) {
            const userPromises = promises.filter(
                (promise) => promise.createdById === userId
            );
            const name =
                users.find((user) => user.id === userId)?.name ??
                "Sin usuario";

            const classified = classifyPromises(
                userPromises.map((promise) => ({
                    id: promise.id,
                    contactId: promise.contactId,
                    type: promise.type,
                    amount: parseAmount(promise.amount),
                    dueAt: promise.dueAt,
                    createdAt: promise.createdAt
                })),
                paymentsByContact
            );

            byUser.set(userId ?? "sin-usuario", {
                name,
                onTime: classified.onTime,
                late: classified.late,
                unpaid: classified.unpaid,
                promisedAmount: classified.promisedAmount,
                paidAmount: classified.paidAmount
            });
        }

        return {
            weeks: [...weeks.entries()]
                .map(([week, value]) => ({ week, ...value }))
                .sort((a, b) => (a.week < b.week ? 1 : -1)),
            byUser: [...byUser.values()].sort((a, b) => b.onTime - a.onTime)
        };
    }

    static defaultThreshold(): number {
        return appConfig.outcomeNoAnswerAttempts;
    }
}
