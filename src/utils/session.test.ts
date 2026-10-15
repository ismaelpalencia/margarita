import assert from "node:assert/strict";
import test from "node:test";

import { isSessionIdle } from "./session";

const HOUR = 60 * 60 * 1000;

test("una sesión usada hace poco no está inactiva", () => {
    const now = new Date("2026-10-15T18:00:00.000Z");

    assert.equal(
        isSessionIdle(
            {
                lastSeenAt: new Date(now.getTime() - 2 * HOUR),
                createdAt: new Date(now.getTime() - 30 * HOUR)
            },
            12 * HOUR,
            now
        ),
        false
    );
});

test("una sesión abandonada se marca inactiva al pasar el límite", () => {
    const now = new Date("2026-10-15T18:00:00.000Z");

    assert.equal(
        isSessionIdle(
            {
                lastSeenAt: new Date(now.getTime() - 13 * HOUR),
                createdAt: new Date(now.getTime() - 40 * HOUR)
            },
            12 * HOUR,
            now
        ),
        true
    );
});

test("sin actividad registrada se toma la fecha de creación", () => {
    const now = new Date("2026-10-15T18:00:00.000Z");

    assert.equal(
        isSessionIdle(
            {
                lastSeenAt: null,
                createdAt: new Date(now.getTime() - 1 * HOUR)
            },
            12 * HOUR,
            now
        ),
        false
    );

    assert.equal(
        isSessionIdle(
            {
                lastSeenAt: null,
                createdAt: new Date(now.getTime() - 20 * HOUR)
            },
            12 * HOUR,
            now
        ),
        true
    );
});
