import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

import { appConfig } from "../config/app.config";

dayjs.extend(utc);
dayjs.extend(timezone);

export function nowInAppTimezone() {
    return dayjs().tz(appConfig.timezone);
}

/**
 * Medianoche de hoy en la zona horaria indicada.
 *
 * Se usa para los topes diarios: así el contador se reinicia a la
 * medianoche local de la empresa, no a la medianoche UTC.
 */
export function startOfTodayIn(timezone: string): Date {
    return dayjs().tz(timezone).startOf("day").toDate();
}

/** Primer minuto del mes en la zona de la empresa. */
export function startOfMonthIn(timezone: string): Date {
    return dayjs().tz(timezone).startOf("month").toDate();
}

/** "2026-11", el mes local de la empresa. */
export function monthKeyIn(timezone: string): string {
    return dayjs().tz(timezone).format("YYYY-MM");
}

/**
 * Lee un `datetime-local` ("2026-10-17T18:00") como hora de la empresa.
 *
 * El navegador manda la hora sin zona; interpretarla en UTC movería la cita
 * seis horas. Devuelve `null` si el texto no es una fecha válida.
 */
export function parseLocalDateTime(
    value: string | null | undefined,
    timezone: string
): Date | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value.trim())) {
        return null;
    }

    const parsed = dayjs.tz(value.trim(), timezone);

    return parsed.isValid() ? parsed.toDate() : null;
}

export function formatDateForApp(date: Date) {
    return dayjs(date).tz(appConfig.timezone).format("YYYY-MM-DD HH:mm:ss");
}

export function formatDateTimeMX(date: Date | string | null | undefined): string {
    if (!date) {
        return "Sin fecha";
    }

    return dayjs(date).tz(appConfig.timezone).format("DD/MM/YYYY HH:mm");
}

export function formatTimeMX(date: Date | string | null | undefined): string {
    if (!date) {
        return "";
    }

    return dayjs(date).tz(appConfig.timezone).format("HH:mm");
}

/**
 * Cuánto lleva esperando algo, en palabras: «hace 12 minutos», «hace 3 horas»,
 * «hace 2 días».
 *
 * En la lista de llamadas importa más esto que la hora exacta, porque lo que
 * se está midiendo es cuánto se enfría la intención del cliente. La
 * referencia se puede fijar para probarlo sin depender del reloj.
 */
export function formatWaitingTime(
    date: Date | string | null | undefined,
    reference: Date = new Date()
): string {
    if (!date) {
        return "";
    }

    const minutes = dayjs(reference).diff(dayjs(date), "minute");

    if (minutes <= 0) {
        return "hace unos segundos";
    }

    if (minutes < 60) {
        return `hace ${minutes} minuto${minutes === 1 ? "" : "s"}`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return `hace ${hours} hora${hours === 1 ? "" : "s"}`;
    }

    const days = Math.floor(hours / 24);

    return `hace ${days} día${days === 1 ? "" : "s"}`;
}

/**
 * Etiqueta del separador de fecha en el chat: "Hoy", "Ayer" o la fecha.
 */
export function formatDayLabelMX(
    date: Date | string | null | undefined
): string {
    if (!date) {
        return "";
    }

    const value = dayjs(date).tz(appConfig.timezone);
    const today = dayjs().tz(appConfig.timezone);

    if (value.isSame(today, "day")) {
        return "Hoy";
    }

    if (value.isSame(today.subtract(1, "day"), "day")) {
        return "Ayer";
    }

    return value.format("DD/MM/YYYY");
}
