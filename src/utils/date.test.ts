import assert from "node:assert/strict";
import test from "node:test";

import {
    formatDateIn,
    formatDateTimeIn,
    formatDayLabelMX,
    formatDateTimeMX,
    formatTimeIn,
    formatTimeMX,
    formatWaitingTime,
    parseLocalDateTime
} from "./date";

test("marca el día actual como Hoy", () => {
    assert.equal(formatDayLabelMX(new Date()), "Hoy");
});

test("marca el día anterior como Ayer", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    assert.equal(formatDayLabelMX(yesterday), "Ayer");
});

test("usa la fecha para días más antiguos", () => {
    const label = formatDayLabelMX(new Date("2024-03-05T18:00:00.000Z"));

    assert.match(label, /^\d{2}\/\d{2}\/2024$/);
});

test("sin fecha devuelve cadena vacía", () => {
    assert.equal(formatDayLabelMX(null), "");
});

test("las horas y fechas respetan la zona de la aplicación", () => {
    const date = new Date("2024-03-05T18:00:00.000Z");

    assert.equal(formatTimeMX(date), "12:00");
    assert.equal(formatDateTimeMX(date), "05/03/2024 12:00");
});

test("un mensaje de las 8:46 en México no se muestra como 2:46", () => {
    /** 14:46 UTC = 08:46 en Ciudad de México (UTC-6). */
    const date = new Date("2026-11-05T14:46:00.000Z");

    assert.equal(formatTimeIn(date, "America/Mexico_City"), "08:46");
    assert.equal(
        formatDateTimeIn(date, "America/Mexico_City"),
        "05/11/2026 08:46"
    );
});

test("la fecha se calcula en la zona del workspace, no en UTC", () => {
    /** 02:00 UTC del 6 de noviembre sigue siendo 5 de noviembre en México. */
    const date = new Date("2026-11-06T02:00:00.000Z");

    assert.equal(formatDateIn(date, "America/Mexico_City"), "05/11/2026");
});

test("la espera se cuenta en minutos, horas y días", () => {
    const now = new Date("2026-10-16T18:00:00.000Z");
    const at = (milliseconds: number) => new Date(now.getTime() - milliseconds);

    assert.equal(formatWaitingTime(at(30 * 1000), now), "hace unos segundos");
    assert.equal(formatWaitingTime(at(60 * 1000), now), "hace 1 minuto");
    assert.equal(formatWaitingTime(at(12 * 60 * 1000), now), "hace 12 minutos");
    assert.equal(formatWaitingTime(at(60 * 60 * 1000), now), "hace 1 hora");
    assert.equal(formatWaitingTime(at(3 * 60 * 60 * 1000), now), "hace 3 horas");
    assert.equal(
        formatWaitingTime(at(30 * 60 * 60 * 1000), now),
        "hace 1 día"
    );
    assert.equal(
        formatWaitingTime(at(50 * 60 * 60 * 1000), now),
        "hace 2 días"
    );
});

test("sin fecha, la espera no inventa un texto", () => {
    assert.equal(formatWaitingTime(null), "");
});

test("la hora de una cita se lee en la zona de la empresa", () => {
    /** 18:00 en Ciudad de México (UTC-6) son las 00:00 UTC del día siguiente. */
    const value = parseLocalDateTime("2026-10-17T18:00", "America/Mexico_City");

    assert.ok(value);
    assert.equal(value!.toISOString(), "2026-10-18T00:00:00.000Z");
});

test("una fecha mal escrita no se convierte en cita", () => {
    assert.equal(parseLocalDateTime("17/10/2026 18:00", "America/Mexico_City"), null);
    assert.equal(parseLocalDateTime("", "America/Mexico_City"), null);
});
