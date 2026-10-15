import { ContactOutcomeType } from "@prisma/client";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

/**
 * Los plugins se cargan aquí y no se heredan de otro módulo: depender del
 * orden de importación hacía que `dayjs.tz` no existiera según quién
 * importara primero.
 */
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Catálogo de resultados de gestión (cobranza).
 *
 * El orden es el que se usa en la interfaz y en los reportes: primero lo que
 * significa dinero comprometido o cobrado, al final lo demás.
 */
export const OUTCOME_TYPES: ContactOutcomeType[] = [
    ContactOutcomeType.PROMISE,
    ContactOutcomeType.PAID,
    ContactOutcomeType.CONVENIO,
    ContactOutcomeType.PROMISE_BROKEN,
    ContactOutcomeType.NO_ANSWER,
    ContactOutcomeType.WRONG_NUMBER,
    ContactOutcomeType.NOT_INTERESTED,
    ContactOutcomeType.CALLBACK,
    ContactOutcomeType.OTHER
];

export const OUTCOME_LABELS: Record<ContactOutcomeType, string> = {
    PROMISE: "Promesa de pago",
    PAID: "Pagado",
    CONVENIO: "Convenio",
    PROMISE_BROKEN: "Promesa incumplida",
    NO_ANSWER: "Sin contestación",
    WRONG_NUMBER: "Número inválido",
    NOT_INTERESTED: "No le interesa",
    CALLBACK: "Volver a llamar",
    OTHER: "Otro"
};

/** Descripción corta para los botones del hilo. */
export const OUTCOME_SHORT_LABELS: Record<ContactOutcomeType, string> = {
    PROMISE: "Prometió pagar",
    PAID: "Pagado",
    CONVENIO: "Convenio",
    PROMISE_BROKEN: "Incumplió",
    NO_ANSWER: "No contestó",
    WRONG_NUMBER: "Número inválido",
    NOT_INTERESTED: "No le interesa",
    CALLBACK: "Volver a llamar",
    OTHER: "Otro"
};

export const OUTCOME_BADGE_CLASSES: Record<ContactOutcomeType, string> = {
    PROMISE: "bg-sky-50 text-sky-700",
    PAID: "bg-emerald-50 text-emerald-700",
    CONVENIO: "bg-indigo-50 text-indigo-700",
    PROMISE_BROKEN: "bg-red-50 text-red-700",
    NO_ANSWER: "bg-amber-50 text-amber-700",
    WRONG_NUMBER: "bg-slate-100 text-slate-600",
    NOT_INTERESTED: "bg-slate-100 text-slate-600",
    CALLBACK: "bg-slate-100 text-slate-600",
    OTHER: "bg-slate-100 text-slate-600"
};

/** Resultados que dejan una promesa abierta y por lo tanto pueden vencer. */
export const OPEN_PROMISE_TYPES: ContactOutcomeType[] = [
    ContactOutcomeType.PROMISE,
    ContactOutcomeType.CONVENIO
];

/** Resultados que piden fecha compromiso (y monto, si se conoce). */
export const TYPES_WITH_DUE_DATE: ContactOutcomeType[] = [
    ContactOutcomeType.PROMISE,
    ContactOutcomeType.CONVENIO
];

/** Resultados que piden monto. */
export const TYPES_WITH_AMOUNT: ContactOutcomeType[] = [
    ContactOutcomeType.PROMISE,
    ContactOutcomeType.PAID,
    ContactOutcomeType.CONVENIO
];

export function isOpenPromise(
    type: ContactOutcomeType | null | undefined
): boolean {
    return Boolean(type && OPEN_PROMISE_TYPES.includes(type));
}

/**
 * Días completos de atraso de una promesa o convenio.
 *
 * Se comparan dos "medianoches locales": la del compromiso y la de hoy, así
 * que una promesa para hoy todavía no está vencida (tiene todo el día).
 * Devuelve 0 cuando no hay atraso.
 */
export function daysOverdue(
    dueAt: Date | null | undefined,
    todayStart: Date
): number {
    if (!dueAt) {
        return 0;
    }

    const diff = todayStart.getTime() - dueAt.getTime();

    if (diff < 24 * 60 * 60 * 1000) {
        return 0;
    }

    return Math.floor(diff / (24 * 60 * 60 * 1000));
}

/**
 * Una promesa vencida **no se guarda**: se deduce de la fecha compromiso
 * mientras siga abierta. Si el cliente paga después, marcar `PAID` la
 * resuelve sola — no hay estado falso que deshacer.
 */
export function isOverdue(
    type: ContactOutcomeType | null | undefined,
    dueAt: Date | null | undefined,
    todayStart: Date
): boolean {
    return isOpenPromise(type) && daysOverdue(dueAt, todayStart) > 0;
}

/** "2026-10-16" → medianoche de ese día en la zona de la empresa. */
export function parseDueDate(
    value: string | null | undefined,
    timezone: string
): Date | null {
    if (!value || !value.trim()) {
        return null;
    }

    const text = value.trim();

    /**
     * Se valida el formato antes de llamar a `dayjs.tz`: con una cadena que
     * no es fecha, el plugin de zona horaria lanza en lugar de devolver un
     * objeto inválido.
     */
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        return null;
    }

    const parsed = dayjs.tz(text, timezone);

    return parsed.isValid() ? parsed.startOf("day").toDate() : null;
}

/**
 * Lee un monto escrito por una persona: acepta "1,234.50", "$1,234.50" y
 * "1234". Devuelve `null` si no hay número.
 */
export function parseAmount(value: string | null | undefined): number | null {
    if (value === null || value === undefined) {
        return null;
    }

    const clean = value.replace(/[^\d.,-]/g, "").trim();

    if (!clean) {
        return null;
    }

    /** Formato mexicano: la coma separa miles, el punto decimales. */
    const normalized = clean.replace(/,/g, "");
    const parsed = Number(normalized);

    if (!Number.isFinite(parsed)) {
        return null;
    }

    return parsed;
}

const currency = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
});

export function formatAmount(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return "";
    }

    return currency.format(value);
}

export type PromiseRecord = {
    id: string;
    contactId: string;
    type: ContactOutcomeType;
    amount: number | null;
    dueAt: Date | null;
    createdAt: Date;
};

export type PaymentRecord = {
    contactId: string;
    amount: number | null;
    paidAt: Date | null;
    createdAt: Date;
};

export type PromiseStatus = "ON_TIME" | "LATE" | "UNPAID";

export type PromiseClassification = PromiseRecord & {
    status: PromiseStatus;
    paidOn: Date | null;
    paidAmount: number | null;
};

export type PromiseSummary = {
    onTime: number;
    late: number;
    unpaid: number;
    promisedAmount: number;
    paidAmount: number;
    items: PromiseClassification[];
};

const ONE_DAY = 24 * 60 * 60 * 1000;

/**
 * Clasifica las promesas de un periodo contra los pagos registrados.
 *
 * Un pago cuenta para una promesa si es del mismo cliente y posterior a la
 * promesa; cada pago se usa una sola vez, así que dos promesas del mismo
 * cliente no se dan por cumplidas con un solo abono.
 *
 * Se considera **a tiempo** si el pago ocurrió el día del compromiso o antes
 * (`dueAt` es la medianoche de ese día, de ahí el día extra).
 */
export function classifyPromises(
    promises: PromiseRecord[],
    payments: PaymentRecord[]
): PromiseSummary {
    const ordered = [...payments].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    const used = new Set<number>();

    const items: PromiseClassification[] = [];

    let onTime = 0;
    let late = 0;
    let unpaid = 0;
    let promisedAmount = 0;
    let paidAmount = 0;

    for (const promise of [...promises].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    )) {
        promisedAmount += promise.amount ?? 0;

        const index = ordered.findIndex(
            (payment, position) =>
                !used.has(position) &&
                payment.contactId === promise.contactId &&
                payment.createdAt.getTime() >= promise.createdAt.getTime()
        );

        if (index === -1) {
            unpaid += 1;
            items.push({
                ...promise,
                status: "UNPAID",
                paidOn: null,
                paidAmount: null
            });
            continue;
        }

        used.add(index);

        const payment = ordered[index];
        const paidOn = payment.paidAt ?? payment.createdAt;

        const withinDueDate = promise.dueAt
            ? paidOn.getTime() < promise.dueAt.getTime() + ONE_DAY
            : false;

        if (withinDueDate) {
            onTime += 1;
        } else {
            late += 1;
        }

        paidAmount += payment.amount ?? 0;

        items.push({
            ...promise,
            status: withinDueDate ? "ON_TIME" : "LATE",
            paidOn,
            paidAmount: payment.amount ?? null
        });
    }

    return { onTime, late, unpaid, promisedAmount, paidAmount, items };
}
