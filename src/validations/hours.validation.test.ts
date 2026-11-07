import assert from "node:assert/strict";
import test from "node:test";
import { OffHoursMode } from "@prisma/client";

import { hoursSchema } from "./hours.validation";

const base = {
    timezone: "America/Mexico_City",
    days: ["1", "2"],
    start: "09:00",
    end: "18:00",
    mode: OffHoursMode.TEXT_ONLY,
    message: "",
    intervalHours: "12"
};

test("acepta el checkbox apagado con el hidden false", () => {
    const parsed = hoursSchema.safeParse({
        ...base,
        businessHoursEnabled: "false"
    });

    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data.businessHoursEnabled, false);
});

test("acepta hidden false y checkbox true cuando está encendido", () => {
    const parsed = hoursSchema.safeParse({
        ...base,
        businessHoursEnabled: ["false", "true"]
    });

    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data.businessHoursEnabled, true);
});

test("sin campo queda apagado", () => {
    const parsed = hoursSchema.safeParse(base);

    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data.businessHoursEnabled, false);
});
