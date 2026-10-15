import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAppUrl, resolveAppUrl } from "./url";

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

test("usa APP_URL cuando está definida", () => {
    const result = resolveAppUrl({
        APP_URL: "https://mi-dominio.com",
        RAILWAY_PUBLIC_DOMAIN: "otro.up.railway.app"
    });

    assert.equal(result.url.url, "https://mi-dominio.com");
    assert.equal(result.source, "APP_URL");
});

test("sin APP_URL toma el dominio público de Railway", () => {
    const result = resolveAppUrl({
        APP_URL: "   ",
        RAILWAY_PUBLIC_DOMAIN: "despacho-prueba.up.railway.app"
    });

    assert.equal(result.url.url, "https://despacho-prueba.up.railway.app");
    assert.equal(result.source, "RAILWAY_PUBLIC_DOMAIN");
});

test("sin nada, cae al default de desarrollo", () => {
    const result = resolveAppUrl({});

    assert.equal(result.url.url, "http://localhost:3000");
    assert.equal(result.source, "DEFAULT");
});

test("el dominio de Railway se normaliza igual que APP_URL", () => {
    /** Por si algún día el proveedor lo entrega con esquema. */
    const result = resolveAppUrl({
        RAILWAY_PUBLIC_DOMAIN: "https://con-esquema.up.railway.app"
    });

    assert.equal(result.url.url, "https://con-esquema.up.railway.app");
});
