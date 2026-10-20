import assert from "node:assert/strict";
import test from "node:test";

import { isValidPhone, normalizePhone } from "./phone";

test("normaliza un número local de 10 dígitos", () => {
    assert.equal(normalizePhone("5548536808"), "5215548536808");
});

test("normaliza un número con lada 52 y espacios", () => {
    assert.equal(normalizePhone("52 55 4853 6808"), "5215548536808");
});

test("respeta el formato de WhatsApp que ya trae el 1", () => {
    assert.equal(normalizePhone("521 55 4853 6808"), "5215548536808");
});

test("ignora guiones, paréntesis y signos", () => {
    assert.equal(normalizePhone("+52 (55) 4853-6808"), "5215548536808");
});

test("conserva números internacionales con lada de país", () => {
    assert.equal(normalizePhone("+1 (415) 555-2671"), "14155552671");
    assert.equal(normalizePhone("+44 20 7946 0958"), "442079460958");
    assert.equal(normalizePhone("00 34 91 123 45 67"), "34911234567");
});

test("conserva un número internacional sin + si ya trae lada", () => {
    assert.equal(normalizePhone("14155552671"), "14155552671");
    assert.equal(normalizePhone("442079460958"), "442079460958");
});

test("rechaza longitudes imposibles", () => {
    assert.throws(() => normalizePhone("12345"));
    assert.throws(() => normalizePhone("1234567890123456"));
    assert.throws(() => normalizePhone(""));
    assert.throws(() => normalizePhone("sin-numeros"));
});

test("isValidPhone acompaña al normalizador", () => {
    assert.equal(isValidPhone("5548536808"), true);
    assert.equal(isValidPhone("+1 415 555 2671"), true);
    assert.equal(isValidPhone("123"), false);
});
