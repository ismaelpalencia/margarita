import assert from "node:assert/strict";
import test from "node:test";

import {
    base32Decode,
    base32Encode,
    buildOtpAuthUrl,
    formatSecretForHumans,
    generateTotpSecret,
    totpCode,
    verifyTotp
} from "./totp";

/**
 * Los vectores son los del RFC 6238 (apéndice B), con el secreto de prueba
 * "12345678901234567890". Si estos pasan, cualquier app de autenticación
 * funciona: es el mismo algoritmo.
 */
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "utf8"));

test("genera códigos que coinciden con los vectores del RFC 6238", () => {
    const vectors: Array<[number, string]> = [
        [59, "287082"],
        [1111111109, "081804"],
        [1111111111, "050471"],
        [1234567890, "005924"],
        [2000000000, "279037"],
        [20000000000, "353130"]
    ];

    for (const [seconds, expected] of vectors) {
        assert.equal(
            totpCode(RFC_SECRET, seconds * 1000),
            expected,
            `el código para ${seconds}s debe ser ${expected}`
        );
    }
});

test("acepta el código de la ventana actual y la anterior o siguiente", () => {
    const now = 1700000000000;
    const previous = totpCode(RFC_SECRET, now - 30 * 1000);
    const current = totpCode(RFC_SECRET, now);
    const next = totpCode(RFC_SECRET, now + 30 * 1000);
    const old = totpCode(RFC_SECRET, now - 5 * 60 * 1000);

    assert.equal(verifyTotp(RFC_SECRET, previous, { now }), true);
    assert.equal(verifyTotp(RFC_SECRET, current, { now }), true);
    assert.equal(verifyTotp(RFC_SECRET, next, { now }), true);

    /** Un código de hace cinco minutos ya no sirve. */
    assert.equal(verifyTotp(RFC_SECRET, old, { now }), false);
});

test("rechaza códigos inventados, vacíos o con formato raro", () => {
    const now = 1700000000000;

    assert.equal(verifyTotp(RFC_SECRET, "000000", { now }), false);
    assert.equal(verifyTotp(RFC_SECRET, "", { now }), false);
    assert.equal(verifyTotp(RFC_SECRET, "12345", { now }), false);
    assert.equal(verifyTotp(RFC_SECRET, "abcdef", { now }), false);
});

test("acepta el código escrito con espacios, como lo muestra la app", () => {
    const now = 1700000000000;
    const code = totpCode(RFC_SECRET, now);
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;

    assert.equal(verifyTotp(RFC_SECRET, spaced, { now }), true);
});

test("el secreto generado es base32 válido y distinto cada vez", () => {
    const first = generateTotpSecret();
    const second = generateTotpSecret();

    assert.notEqual(first, second);
    assert.equal(first.length, 32, "20 bytes en base32 son 32 caracteres");
    assert.match(first, /^[A-Z2-7]+$/);
    assert.ok(base32Decode(first).length === 20);
});

test("un secreto con caracteres inválidos se rechaza con un mensaje claro", () => {
    assert.throws(() => base32Decode("no-es-base32!"), /formato inválido/i);
});

test("el URI de configuración lleva el emisor, la cuenta y el algoritmo", () => {
    const url = buildOtpAuthUrl({
        secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
        account: "admin@despacho.mx",
        issuer: "Margarita"
    });

    assert.ok(url.startsWith("otpauth://totp/Margarita%3Aadmin%40despacho.mx?"));
    assert.ok(url.includes("secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"));
    assert.ok(url.includes("issuer=Margarita"));
    assert.ok(url.includes("digits=6"));
    assert.ok(url.includes("period=30"));
    assert.ok(url.includes("algorithm=SHA1"));
});

test("el secreto se muestra en grupos para poder dictarlo", () => {
    assert.equal(
        formatSecretForHumans("ABCDEFGHIJKLMNOP"),
        "ABCD EFGH IJKL MNOP"
    );
});
