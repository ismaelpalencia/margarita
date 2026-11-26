import assert from "node:assert/strict";
import test from "node:test";
import { decideCallReception } from "./call-reception";

const schedule = { timezone: "America/Mexico_City", days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" };

test("la recepción apagada manualmente rechaza aunque el horario esté abierto", () => {
    assert.deepEqual(decideCallReception({ enabled: false, autoRejectOutsideHours: true, businessHoursEnabled: true, businessHours: schedule, now: new Date("2026-11-26T18:00:00Z") }), { allowed: false, reason: "manual" });
});

test("el rechazo por horario solo se activa al habilitar el modo automático", () => {
    const now = new Date("2026-11-26T03:00:00Z");
    assert.deepEqual(decideCallReception({ enabled: true, autoRejectOutsideHours: false, businessHoursEnabled: true, businessHours: schedule, now }), { allowed: true });
    assert.deepEqual(decideCallReception({ enabled: true, autoRejectOutsideHours: true, businessHoursEnabled: true, businessHours: schedule, now }), { allowed: false, reason: "outside_hours" });
});

test("horario apagado no bloquea recepción aunque esté marcado el rechazo automático", () => {
    assert.deepEqual(decideCallReception({ enabled: true, autoRejectOutsideHours: true, businessHoursEnabled: false, businessHours: schedule, now: new Date("2026-11-26T15:00:00Z") }), { allowed: true });
});
