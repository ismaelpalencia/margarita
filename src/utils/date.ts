import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

import { appConfig } from "../config/app.config";

dayjs.extend(utc);
dayjs.extend(timezone);

export function nowInAppTimezone() {
    return dayjs().tz(appConfig.timezone);
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