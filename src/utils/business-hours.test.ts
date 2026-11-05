import assert from "node:assert/strict";
import test from "node:test";

import {
    BusinessHours,
    isWithinBusinessHours,
    localClockIn,
    minutesOf,
    parseBusinessHours
} from "./business-hours";

const weekdays: BusinessHours = {
    timezone: "America/Mexico_City",
    days: [1, 2, 3, 4, 5],
    start: "09:00",
    end: "18:00"
};

test("minutesOf convierte HH:MM y rechaza lo inválido", () => {
    assert.equal(minutesOf("09:00"), 540);
    assert.equal(minutesOf("00:00"), 0);
    assert.equal(minutesOf("23:59"), 1439);
    assert.equal(minutesOf("24:00"), null);
    assert.equal(minutesOf("9:00"), null);
    assert.equal(minutesOf("09:60"), null);
    assert.equal(minutesOf(""), null);
});

test("parseBusinessHours rechaza JSON incompleto", () => {
    assert.equal(parseBusinessHours(null), null);
    assert.equal(parseBusinessHours(undefined), null);
    assert.equal(parseBusinessHours({ timezone: "X" }), null);
    assert.equal(
        parseBusinessHours({ timezone: "X", days: [], start: "09:00", end: "18:00" }),
        null
    );
    assert.equal(
        parseBusinessHours({ timezone: "X", days: [1], start: "9", end: "18:00" }),
        null
    );

    const ok = parseBusinessHours({
        timezone: "America/Mexico_City",
        days: [1, 2],
        start: "09:00",
        end: "18:00"
    });

    assert.deepEqual(ok, {
        timezone: "America/Mexico_City",
        days: [1, 2],
        start: "09:00",
        end: "18:00"
    });
});

test("America/Mexico_City: dentro y fuera, con frontera exacta", () => {
    /** 10:00 local (México es UTC-6 sin DST). */
    assert.equal(
        isWithinBusinessHours(weekdays, new Date("2026-11-04T16:00:00Z")),
        true
    );

    /** 22:00 local del miércoles: fuera. */
    assert.equal(
        isWithinBusinessHours(weekdays, new Date("2026-11-05T04:00:00Z")),
        false
    );

    /** 09:00 exacto: dentro (inicio inclusive). */
    assert.equal(
        isWithinBusinessHours(weekdays, new Date("2026-11-04T15:00:00Z")),
        true
    );

    /** 18:00 exacto: fuera (final exclusive). */
    assert.equal(
        isWithinBusinessHours(weekdays, new Date("2026-11-05T00:00:00Z")),
        false
    );
});

test("America/Mexico_City: el día de la semana decide", () => {
    /** Sábado 10:00 local. */
    assert.equal(
        isWithinBusinessHours(weekdays, new Date("2026-11-07T16:00:00Z")),
        false
    );

    /** Domingo 10:00 local. */
    assert.equal(
        isWithinBusinessHours(weekdays, new Date("2026-11-08T16:00:00Z")),
        false
    );
});

test("localClockIn respeta DST con Intl", () => {
    /** Invierno (EST, UTC-5): 14:00 UTC = 09:00 local del jueves. */
    assert.deepEqual(
        localClockIn("America/New_York", new Date("2026-01-15T14:00:00Z")),
        { day: 4, minutes: 540 }
    );

    /** Verano (EDT, UTC-4): 13:00 UTC = 09:00 local del miércoles. */
    assert.deepEqual(
        localClockIn("America/New_York", new Date("2026-07-15T13:00:00Z")),
        { day: 3, minutes: 540 }
    );
});

test("un tramo que cruza la medianoche se interpreta correcto", () => {
    const overnight: BusinessHours = {
        timezone: "America/Mexico_City",
        days: [0, 1, 2, 3, 4, 5, 6],
        start: "22:00",
        end: "06:00"
    };

    /** 23:00 local del miércoles: dentro. */
    assert.equal(
        isWithinBusinessHours(overnight, new Date("2026-11-05T05:00:00Z")),
        true
    );

    /** 03:00 local del jueves: dentro. */
    assert.equal(
        isWithinBusinessHours(overnight, new Date("2026-11-05T09:00:00Z")),
        true
    );

    /** 12:00 local del jueves: fuera. */
    assert.equal(
        isWithinBusinessHours(overnight, new Date("2026-11-05T18:00:00Z")),
        false
    );
});

test("start === end deja el día abierto", () => {
    const allDay: BusinessHours = {
        timezone: "America/Mexico_City",
        days: [3],
        start: "09:00",
        end: "09:00"
    };

    assert.equal(
        isWithinBusinessHours(allDay, new Date("2026-11-04T16:00:00Z")),
        true
    );
});

test("sin horario configurado siempre está dentro", () => {
    assert.equal(isWithinBusinessHours(null, new Date()), true);
});
