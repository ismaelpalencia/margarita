/**
 * Horario de atención: cálculo puro y sin dependencias nuevas.
 *
 * Se usa Intl.DateTimeFormat con la zona horaria de la empresa para leer la
 * hora local de un instante. Así no hay que sumar/restar offsets a mano ni
 * depender de tablas de zona horaria: Intl resuelve DST y cambios de hora
 * del sistema operativo.
 *
 * Semántica del intervalo:
 * - Los días se expresan como Date.getDay(): 0 = domingo … 6 = sábado.
 * - start/end son "HH:MM" en la zona de la empresa.
 * - El intervalo es cerrado-abierto [start, end): en end exacto ya se está
 *   fuera de horario.
 * - Si start > end, el tramo cruza la medianoche (por ejemplo 22:00–06:00).
 * - Si start === end, ese día se considera abierto todo el día.
 */

export type BusinessHours = {
    timezone: string;
    /** Días de la semana (0 = domingo … 6 = sábado). */
    days: number[];
    /** "HH:MM" en la zona de la empresa. */
    start: string;
    /** "HH:MM" en la zona de la empresa. */
    end: string;
};

export type LocalClock = {
    /** 0 = domingo … 6 = sábado. */
    day: number;
    /** Minutos desde medianoche en la zona indicada. */
    minutes: number;
};

const WEEKDAYS: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
};

/** Hora local (día de la semana y minutos desde medianoche) en una zona. */
export function localClockIn(timezone: string, date: Date): LocalClock {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).formatToParts(date);

    let day = 0;
    let hour = 0;
    let minute = 0;

    for (const part of parts) {
        if (part.type === "weekday") {
            day = WEEKDAYS[part.value] ?? 0;
        } else if (part.type === "hour") {
            hour = Number(part.value.replace(/^0/, "") || "0");
        } else if (part.type === "minute") {
            minute = Number(part.value.replace(/^0/, "") || "0");
        }
    }

    return { day, minutes: hour * 60 + minute };
}

/** "HH:MM" → minutos desde medianoche. Devuelve null si no es válido. */
export function minutesOf(time: string): number | null {
    const match = /^(\d{2}):(\d{2})$/.exec(time.trim());

    if (!match) {
        return null;
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (hour > 23 || minute > 59) {
        return null;
    }

    return hour * 60 + minute;
}

/**
 * Normaliza el JSON que guarda el workspace. Si el horario no se puede leer
 * (faltan días, horas inválidas), devuelve null: fuera de horario no se
 * aplica y la instalación se comporta como si no tuviera horario configurado.
 */
export function parseBusinessHours(value: unknown): BusinessHours | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }

    const raw = value as Record<string, unknown>;

    if (typeof raw.timezone !== "string" || raw.timezone.trim() === "") {
        return null;
    }

    if (!Array.isArray(raw.days) || raw.days.length === 0) {
        return null;
    }

    const days = raw.days
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

    if (days.length === 0) {
        return null;
    }

    const start = minutesOf(String(raw.start));
    const end = minutesOf(String(raw.end));

    if (start === null || end === null) {
        return null;
    }

    return {
        timezone: raw.timezone,
        days,
        start: String(raw.start),
        end: String(raw.end)
    };
}

/** ¿El instante cae dentro del horario configurado? */
export function isWithinBusinessHours(
    hours: BusinessHours | null,
    date: Date
): boolean {
    if (!hours) {
        return true;
    }

    const start = minutesOf(hours.start);
    const end = minutesOf(hours.end);

    if (start === null || end === null) {
        return true;
    }

    const { day, minutes } = localClockIn(hours.timezone, date);

    if (!hours.days.includes(day)) {
        return false;
    }

    /** start === end: ese día queda abierto todo el día. */
    if (start === end) {
        return true;
    }

    if (start < end) {
        return minutes >= start && minutes < end;
    }

    /** Tramo que cruza la medianoche (por ejemplo 22:00–06:00). */
    return minutes >= start || minutes < end;
}
