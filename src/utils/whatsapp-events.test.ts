import assert from "node:assert/strict";
import test from "node:test";

import {
    describeReason,
    mapQualityEvent,
    mapTemplateEvent
} from "./whatsapp-events";

test("traduce los eventos de plantilla", () => {
    assert.equal(mapTemplateEvent("APPROVED")?.status, "APPROVED");
    assert.equal(mapTemplateEvent("REJECTED")?.status, "REJECTED");
    assert.equal(mapTemplateEvent("PAUSED")?.status, "PAUSED");
    assert.equal(mapTemplateEvent("DISABLED")?.status, "DISABLED");
    assert.equal(mapTemplateEvent("FLAGGED")?.status, "FLAGGED");
    assert.equal(mapTemplateEvent("REINSTATED")?.status, "APPROVED");
});

test("marca como críticos los eventos que exigen atención", () => {
    assert.equal(mapTemplateEvent("APPROVED")?.critical, false);
    assert.equal(mapTemplateEvent("REJECTED")?.critical, true);
    assert.equal(mapTemplateEvent("PAUSED")?.critical, true);
    assert.equal(mapTemplateEvent("FLAGGED")?.critical, true);
    assert.equal(mapTemplateEvent("DISABLED")?.critical, true);
});

test("ignora eventos desconocidos de plantilla", () => {
    assert.equal(mapTemplateEvent("LO_QUE_SEA"), null);
    assert.equal(mapTemplateEvent(null), null);
    assert.equal(mapTemplateEvent(""), null);
});

test("traduce los eventos de calidad del número", () => {
    assert.equal(mapQualityEvent("FLAGGED")?.status, "FLAGGED");
    assert.equal(mapQualityEvent("FLAGGED")?.critical, true);
    assert.equal(mapQualityEvent("UNFLAGGED")?.status, "CONNECTED");
    assert.equal(mapQualityEvent("UNFLAGGED")?.critical, false);
    assert.equal(mapQualityEvent("OTRO"), null);
});

test("cada evento trae una explicación en español", () => {
    assert.match(String(mapTemplateEvent("REJECTED")?.description), /rechazó/);
    assert.match(String(mapQualityEvent("FLAGGED")?.description), /calidad/);
});

test("limpia el motivo que envía Meta", () => {
    assert.equal(describeReason("  contenido de baja calidad  "), "contenido de baja calidad");
    assert.equal(describeReason(""), null);
    assert.equal(describeReason(undefined), null);
    assert.equal(describeReason(42), null);
});
