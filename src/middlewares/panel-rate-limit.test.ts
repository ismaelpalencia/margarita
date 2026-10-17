import assert from "node:assert/strict";
import test from "node:test";

import type { Request, Response } from "express";

import {
    panelRateLimitKey,
    tooManyRequestsResponse
} from "./panel-rate-limit.middleware";

test("el cupo se cuenta por usuario, no por IP", () => {
    const req = {
        ip: "10.0.0.1",
        user: { id: "usr_123" }
    } as unknown as Request;

    assert.equal(panelRateLimitKey(req), "user:usr_123");
});

test("sin sesión se cae a la IP (login y páginas públicas)", () => {
    const req = { ip: "10.0.0.1", user: undefined } as unknown as Request;

    assert.equal(panelRateLimitKey(req), "ip:10.0.0.1");
});

test("el 429 dice cuánto falta y a quién avisar", () => {
    const headers: Record<string, string> = {};
    let body = "";
    let status = 0;

    const req = {
        rateLimit: { resetTime: new Date(Date.now() + 3 * 60 * 1000) }
    } as unknown as Request;

    const res = {
        setHeader(name: string, value: string) {
            headers[name] = value;
        },
        status(code: number) {
            status = code;
            return this;
        },
        type() {
            return this;
        },
        send(value: string) {
            body = value;
        }
    } as unknown as Response;

    tooManyRequestsResponse(req, res, () => undefined, {
        windowMs: 15 * 60 * 1000
    });

    assert.equal(status, 429);
    assert.ok(headers["Retry-After"], "incluye Retry-After");
    assert.match(body, /Espera 3 minutos/);
    assert.match(body, /vuelve a intentar/);
});
