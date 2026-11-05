import assert from "node:assert/strict";
import test from "node:test";

import { AssigneeCandidate, pickAssignee } from "./assignment";

function agent(id: string, status: string, load: number): AssigneeCandidate {
    return { id, name: "A-" + id, role: "AGENT", status, load };
}

function admin(id: string, load: number): AssigneeCandidate {
    return { id, name: "Admin-" + id, role: "ADMIN", status: "OFFLINE", load };
}

test("rama 1: AVAILABLE con menos carga", () => {
    const decision = pickAssignee(
        [agent("1", "AVAILABLE", 3), agent("2", "AVAILABLE", 1), admin("9", 0)],
        true
    );

    assert.deepEqual(decision, { kind: "assign", userId: "2", step: "AVAILABLE_LEAST_BUSY" });
});

test("rama 2: sin AVAILABLE, BUSY con menos carga", () => {
    const decision = pickAssignee(
        [agent("1", "BUSY", 2), agent("2", "BUSY", 5), agent("3", "BREAK", 0)],
        true
    );

    assert.deepEqual(decision, { kind: "assign", userId: "1", step: "BUSY_LEAST_BUSY" });
});

test("rama 3: sin agentes, admin con menos carga", () => {
    const decision = pickAssignee(
        [agent("1", "OFFLINE", 0), admin("8", 4), admin("9", 1)],
        true
    );

    assert.deepEqual(decision, { kind: "assign", userId: "9", step: "ADMIN_LEAST_BUSY" });
});

test("rama 3b: admin deshabilitado por configuración", () => {
    const decision = pickAssignee([agent("1", "OFFLINE", 0), admin("9", 0)], false);

    assert.deepEqual(decision, { kind: "unassigned", step: "UNASSIGNED" });
});

test("rama 4: nadie disponible", () => {
    const decision = pickAssignee([agent("1", "OFFLINE", 0), agent("2", "BREAK", 0)], true);

    assert.deepEqual(decision, { kind: "unassigned", step: "UNASSIGNED" });
});

test("empate de carga se resuelve por nombre", () => {
    const decision = pickAssignee(
        [agent("b", "AVAILABLE", 2), agent("a", "AVAILABLE", 2)],
        true
    );

    assert.deepEqual(decision, { kind: "assign", userId: "a", step: "AVAILABLE_LEAST_BUSY" });
});