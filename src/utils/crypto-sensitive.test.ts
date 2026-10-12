import assert from "node:assert/strict";
import test from "node:test";

import {
    blindIndex,
    decryptJson,
    encryptJson,
    safeDecryptSecret
} from "./crypto";

const TEST_KEY = "clave-de-prueba-para-campos-cifrados-1234567890";

test("el índice ciego es estable para el mismo valor", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const first = blindIndex("5215500000001");
    const second = blindIndex("5215500000001");

    assert.equal(first, second);
    assert.equal(first.length, 64);
});

test("valores distintos producen índices distintos", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    assert.notEqual(blindIndex("5215500000001"), blindIndex("5215500000002"));
});

test("el índice ciego no revela el valor original", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    assert.equal(blindIndex("5215500000001").includes("5215500000001"), false);
});

test("cambiar la llave cambia el índice ciego", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
    const withKeyOne = blindIndex("5215500000001");

    process.env.ENCRYPTION_KEY = "otra-clave-completamente-distinta-1234567890";
    const withKeyTwo = blindIndex("5215500000001");

    assert.notEqual(withKeyOne, withKeyTwo);
});

test("guarda y recupera un objeto como texto cifrado", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const original = { body: "hola", phone: "5215500000001" };
    const stored = encryptJson(original);

    assert.equal(typeof stored, "string");
    assert.equal(stored.includes("5215500000001"), false);
    assert.deepEqual(decryptJson(stored), original);
});

test("lee objetos que quedaron en claro antes del cifrado", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    assert.deepEqual(decryptJson({ body: "viejo" }), { body: "viejo" });
    assert.deepEqual(decryptJson('{"body":"viejo"}'), { body: "viejo" });
    assert.equal(decryptJson(null), null);
});

test("un valor cifrado ilegible no rompe la consulta", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const roto = "enc:v1:aaaa:bbbb:cccc";

    assert.equal(safeDecryptSecret(roto), roto);
});
