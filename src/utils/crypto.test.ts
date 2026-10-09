import assert from "node:assert/strict";
import test from "node:test";

import { decryptSecret, encryptSecret, isEncrypted } from "./crypto";

const TEST_KEY = "clave-de-prueba-para-tests-automaticos-1234567890";

test("cifra y descifra un valor sin perder información", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const original = "EAAG1234token-de-meta-con-caracteres-ñ-y-acentos-áéí";
    const encrypted = encryptSecret(original);

    assert.ok(isEncrypted(encrypted), "el valor debe quedar marcado como cifrado");
    assert.notEqual(encrypted, original, "el valor cifrado no debe ser igual al original");
    assert.equal(decryptSecret(encrypted), original);
});

test("dos cifrados del mismo valor producen resultados distintos (IV aleatorio)", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const first = encryptSecret("mismo-valor");
    const second = encryptSecret("mismo-valor");

    assert.notEqual(first, second);
    assert.equal(decryptSecret(first), "mismo-valor");
    assert.equal(decryptSecret(second), "mismo-valor");
});

test("acepta una llave de 64 caracteres hexadecimales", () => {
    process.env.ENCRYPTION_KEY = "a".repeat(64);

    const encrypted = encryptSecret("token-hex");

    assert.equal(decryptSecret(encrypted), "token-hex");
});

test("devuelve sin cambios los valores guardados antes del cifrado", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    assert.equal(decryptSecret("token-en-texto-plano"), "token-en-texto-plano");
    assert.equal(isEncrypted("token-en-texto-plano"), false);
});

test("sin llave configurada guarda en claro y avisa", () => {
    process.env.ENCRYPTION_KEY = "";

    assert.equal(encryptSecret("valor-sin-llave"), "valor-sin-llave");
});

test("no vuelve a cifrar un valor ya cifrado", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const encrypted = encryptSecret("dato");

    assert.equal(encryptSecret(encrypted), encrypted);
});

test("rechaza un valor cifrado manipulado", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const encrypted = encryptSecret("dato-original");
    const parts = encrypted.split(":");

    // Se altera el primer carácter del contenido para simular manipulación.
    const originalData = parts[4];
    const tamperedFirstChar = originalData[0] === "A" ? "B" : "A";

    const tampered = [
        parts[0],
        parts[1],
        parts[2],
        parts[3],
        tamperedFirstChar + originalData.slice(1)
    ].join(":");

    assert.throws(() => decryptSecret(tampered));
});

test("rechaza un valor cifrado con formato inválido", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    assert.throws(() => decryptSecret("enc:v1:formato-invalido"));
});
