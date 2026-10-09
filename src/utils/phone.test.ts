import assert from "node:assert/strict";
import test from "node:test";

import { isValidMexicanPhone, normalizeMexicanPhone } from "./phone";

test("normaliza un número local de 10 dígitos", () => {
    assert.equal(normalizeMexicanPhone("5548536808"), "5215548536808");
});

test("normaliza un número con lada 52 y espacios", () => {
    assert.equal(normalizeMexicanPhone("52 55 4853 6808"), "5215548536808");
});

test("respeta el formato de WhatsApp que ya trae el 1", () => {
    assert.equal(normalizeMexicanPhone("521 55 4853 6808"), "5215548536808");
});

test("ignora guiones, paréntesis y signos", () => {
    assert.equal(normalizeMexicanPhone("+52 (55) 4853-6808"), "5215548536808");
});

test("rechaza longitudes que no corresponden a México", () => {
    assert.throws(() => normalizeMexicanPhone("12345"));
    assert.throws(() => normalizeMexicanPhone("12345678901234"));
    assert.throws(() => normalizeMexicanPhone(""));
    assert.throws(() => normalizeMexicanPhone("sin-numeros"));
});

test("isValidMexicanPhone acompaña al normalizador", () => {
    assert.equal(isValidMexicanPhone("5548536808"), true);
    assert.equal(isValidMexicanPhone("123"), false);
});
