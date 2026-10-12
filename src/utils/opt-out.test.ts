import assert from "node:assert/strict";
import test from "node:test";

import {
    matchesOptOutKeyword,
    normalizeForComparison,
    parseOptOutKeywords
} from "./opt-out";

test("normaliza acentos, mayúsculas y signos", () => {
    assert.equal(normalizeForComparison("  ¡Bája! "), "BAJA");
    assert.equal(normalizeForComparison("Stop."), "STOP");
    assert.equal(normalizeForComparison("no   molestar"), "NO MOLESTAR");
});

test("sin configuración la única palabra de baja es STOP", () => {
    assert.deepEqual(parseOptOutKeywords(undefined), ["STOP"]);
    assert.deepEqual(parseOptOutKeywords("   "), ["STOP"]);
});

test("acepta varias palabras separadas por coma y las normaliza", () => {
    assert.deepEqual(parseOptOutKeywords("stop, baja , Cancelar"), [
        "STOP",
        "BAJA",
        "CANCELAR"
    ]);
});

test("reconoce la palabra exacta, con signos o con texto después", () => {
    const keywords = parseOptOutKeywords("STOP");

    assert.equal(matchesOptOutKeyword("STOP", keywords), true);
    assert.equal(matchesOptOutKeyword("stop", keywords), true);
    assert.equal(matchesOptOutKeyword("  ¡Stop!! ", keywords), true);
    assert.equal(matchesOptOutKeyword("STOP por favor", keywords), true);
    assert.equal(matchesOptOutKeyword("stop, ya no me escriban", keywords), true);
});

test("no da de baja cuando la palabra aparece en medio de la frase", () => {
    const keywords = parseOptOutKeywords("STOP");

    assert.equal(
        matchesOptOutKeyword("el botón de stop no funciona", keywords),
        false
    );
    assert.equal(matchesOptOutKeyword("quiero parar de recibir", keywords), false);
    assert.equal(matchesOptOutKeyword("hola", keywords), false);
});

test("no da de baja con mensajes vacíos o sin contenido", () => {
    const keywords = parseOptOutKeywords("STOP");

    assert.equal(matchesOptOutKeyword("", keywords), false);
    assert.equal(matchesOptOutKeyword(null, keywords), false);
    assert.equal(matchesOptOutKeyword(undefined, keywords), false);
    assert.equal(matchesOptOutKeyword("   ", keywords), false);
    assert.equal(matchesOptOutKeyword("!!!", keywords), false);
});

test("con varias palabras configuradas reconoce cualquiera", () => {
    const keywords = parseOptOutKeywords("STOP,BAJA");

    assert.equal(matchesOptOutKeyword("baja", keywords), true);
    assert.equal(matchesOptOutKeyword("BAJA por favor", keywords), true);
    assert.equal(matchesOptOutKeyword("cancelar", keywords), false);
});
