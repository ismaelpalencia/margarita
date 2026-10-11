import assert from "node:assert/strict";
import test from "node:test";

import { formatDayLabelMX, formatDateTimeMX, formatTimeMX } from "./date";

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
