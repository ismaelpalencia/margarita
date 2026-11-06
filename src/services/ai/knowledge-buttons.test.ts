import assert from "node:assert/strict";
import test from "node:test";

import { parseKnowledgeButtons } from "./knowledge-buttons";

test("sin títulos devuelve null", () => {
    assert.equal(parseKnowledgeButtons(["", "   "]), null);
});

test("genera IDs estables y títulos válidos", () => {
    const buttons = parseKnowledgeButtons(["Iniciar simulación", "Sí quiero empezar"]);

    assert.deepEqual(buttons, [
        { id: "INICIAR_SIMULACION", title: "Iniciar simulación" },
        { id: "SI_QUIERO_EMPEZAR", title: "Sí quiero empezar" }
    ]);
});

test("rechaza más de tres botones", () => {
    assert.throws(
        () => parseKnowledgeButtons(["Uno", "Dos", "Tres", "Cuatro"]),
        /hasta 3 botones/
    );
});

test("rechaza títulos de más de 20 caracteres", () => {
    assert.throws(
        () => parseKnowledgeButtons(["Este título pasa de veinte"]),
        /pasa de 20 caracteres/
    );
});
