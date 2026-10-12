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
