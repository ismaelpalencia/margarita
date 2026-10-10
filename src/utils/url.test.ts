import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAppUrl } from "./url";

test("agrega https cuando el dominio viene sin esquema", () => {
    const result = normalizeAppUrl("margarita-production-6a8b.up.railway.app");

    assert.equal(result.url, "https://margarita-production-6a8b.up.railway.app");
    assert.equal(result.normalized, true);
});

test("respeta una URL que ya trae esquema", () => {
    const result = normalizeAppUrl("https://mi-dominio.com");

    assert.equal(result.url, "https://mi-dominio.com");
    assert.equal(result.normalized, false);
});

test("usa http para localhost", () => {
    assert.equal(normalizeAppUrl("localhost:3000").url, "http://localhost:3000");
    assert.equal(normalizeAppUrl("127.0.0.1:8080").url, "http://127.0.0.1:8080");
});

test("quita la barra final", () => {
    assert.equal(
        normalizeAppUrl("https://mi-dominio.com/").url,
        "https://mi-dominio.com"
    );
});

test("sin valor cae al default de desarrollo", () => {
    assert.equal(normalizeAppUrl(undefined).url, "http://localhost:3000");
    assert.equal(normalizeAppUrl("   ").url, "http://localhost:3000");
});

test("acepta http explícito en producción (por si hay proxy interno)", () => {
    const result = normalizeAppUrl("http://interna.local:8080");

    assert.equal(result.url, "http://interna.local:8080");
    assert.equal(result.normalized, false);
});
