import assert from "node:assert/strict";
import test from "node:test";

import {
    guidedStepsSchema,
    guidedTriggerMatches,
    parseGuidedSteps
} from "./guided-flow";
import { PENSION_GUIDED_STEPS } from "./guided-flow.template";

test("la plantilla de pensión es válida", () => {
    const parsed = guidedStepsSchema.safeParse(PENSION_GUIDED_STEPS);
    assert.equal(parsed.success, true);
});

test("rechaza un destino que no existe", () => {
    const parsed = parseGuidedSteps([
        {
            id: "inicio",
            type: "message",
            text: "Hola",
            next: "no-existe"
        }
    ]);

    assert.equal(parsed.success, false);
});

test("rechaza una pregunta sin destino para un botón", () => {
    const parsed = parseGuidedSteps([
        {
            id: "p1",
            type: "question",
            text: "¿Sí o no?",
            buttons: [
                { id: "si", title: "Sí" },
                { id: "no", title: "No" }
            ],
            next: { si: "fin" }
        },
        { id: "fin", type: "end", text: "Listo", links: [], handoff: false }
    ]);

    assert.equal(parsed.success, false);
});

test("acepta un paso de dato numérico", () => {
    const parsed = parseGuidedSteps([
        {
            id: "edad",
            type: "input",
            text: "¿Cuántos años tienes?",
            field: "edad",
            inputType: "number",
            next: "fin"
        },
        { id: "fin", type: "end", text: "Gracias", links: [], handoff: false }
    ]);

    assert.equal(parsed.success, true);
});

test("el trigger ignora acentos y mayúsculas", () => {
    assert.equal(
        guidedTriggerMatches("pension|jubilado", "¿Soy PENSIONADO del IMSS?"),
        true
    );
});
