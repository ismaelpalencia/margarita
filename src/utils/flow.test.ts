import assert from "node:assert/strict";
import test from "node:test";

import { flowTriggerMatches, normalizeFlowText } from "./flow";

test("normaliza acentos, mayúsculas y espacios", () => {
    assert.equal(normalizeFlowText("  Hola   BUENOS Días "), "hola buenos dias");
    assert.equal(normalizeFlowText("¿Cuánto cuesta?"), "¿cuanto cuesta?");
});

test("empareja el trigger separado por |", () => {
    const trigger = "hola|buenos dias|buenas tardes";

    assert.equal(flowTriggerMatches(trigger, "Hola, ¿me ayudan?"), true);
    assert.equal(flowTriggerMatches(trigger, "buenas tardes"), true);
    assert.equal(flowTriggerMatches(trigger, "buenos días"), true);
    assert.equal(flowTriggerMatches(trigger, "quiero un reembolso"), false);
    assert.equal(flowTriggerMatches(trigger, ""), false);
});

test("no empareja con texto vacío ni trigger vacío", () => {
    assert.equal(flowTriggerMatches("hola", ""), false);
    assert.equal(flowTriggerMatches("", "hola"), false);
});