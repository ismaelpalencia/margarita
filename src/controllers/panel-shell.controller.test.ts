import assert from "node:assert/strict";
import test from "node:test";
import type { Request, Response } from "express";

import { PanelShellController } from "./panel-shell.controller";

function run(locals: Record<string, unknown>, role = "ADMIN") {
    let body: Record<string, unknown> | null = null;

    const req = { user: { role } } as unknown as Request;
    const res = {
        locals,
        json(payload: Record<string, unknown>) {
            body = payload;
            return payload;
        }
    } as unknown as Response;

    PanelShellController.data(req, res);

    assert.ok(body);
    return body as Record<string, unknown>;
}

test("devuelve el número activo y solo los números encendidos", () => {
    const body = run({
        activeNumber: { id: "n1" },
        activeNumbers: [
            { id: "n1", displayName: "Ventas", phoneNumber: "5211111111111", isActive: true },
            { id: "n2", displayName: null, phoneNumber: "5222222222222", isActive: false },
            { id: "n3", displayName: "Cobranza", phoneNumber: "5233333333333", isActive: true }
        ],
        unreadTotal: 4,
        unreadByNumber: { n1: 3, n3: 6 },
        unassignedCount: 2
    });

    assert.equal(body.activeNumberId, "n1");
    assert.equal(body.role, "ADMIN");
    assert.equal(body.unreadTotal, 4);
    assert.equal(body.unassignedCount, 2);
    assert.deepEqual(body.numbers, [
        { id: "n1", displayName: "Ventas", phoneNumber: "5211111111111", unreadCount: 3 },
        { id: "n3", displayName: "Cobranza", phoneNumber: "5233333333333", unreadCount: 6 }
    ]);
});

test("tolera un armazón sin números ni contadores", () => {
    const body = run({});

    assert.equal(body.activeNumberId, null);
    assert.deepEqual(body.numbers, []);
    assert.equal(body.unreadTotal, 0);
    assert.equal(body.unassignedCount, 0);
});

test("conserva el rol del agente", () => {
    const body = run({}, "AGENT");

    assert.equal(body.role, "AGENT");
});
