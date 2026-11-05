import assert from "node:assert/strict";
import test from "node:test";

import { monthKeyIn } from "./aiUsage.service";

test("el mes se calcula en la zona del workspace, no en UTC", () => {
    /** 2026-12-01 05:30 UTC = 2026-11-30 23:30 en Ciudad de México. */
    assert.deepEqual(monthKeyIn("America/Mexico_City", new Date("2026-12-01T05:30:00Z")), {
        year: 2026,
        month: 11
    });

    /** 2026-12-01 07:00 UTC = 2026-12-01 01:00 en Ciudad de México. */
    assert.deepEqual(monthKeyIn("America/Mexico_City", new Date("2026-12-01T07:00:00Z")), {
        year: 2026,
        month: 12
    });
});

test("el cambio de año también respeta la zona", () => {
    /** 2027-01-01 05:00 UTC = 2026-12-31 23:00 en Ciudad de México. */
    assert.deepEqual(monthKeyIn("America/Mexico_City", new Date("2027-01-01T05:00:00Z")), {
        year: 2026,
        month: 12
    });
});