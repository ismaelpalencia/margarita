import assert from "node:assert/strict";
import test from "node:test";

import { checkRequestOrigin } from "./origin-check";

const APP_URL = "https://margarita-production-6a8b.up.railway.app";

test("permite el mismo dominio con el mismo esquema", () => {
    const result = checkRequestOrigin(APP_URL, APP_URL);

    assert.equal(result.allowed, true);
    assert.equal(result.schemeMismatch, false);
});

test("permite el mismo dominio si el navegador llega por http", () => {
    const result = checkRequestOrigin(
        "http://margarita-production-6a8b.up.railway.app",
        APP_URL
    );

    assert.equal(result.allowed, true);
    assert.equal(result.schemeMismatch, true);
});

test("bloquea otro dominio", () => {
    const result = checkRequestOrigin("https://malicioso.example", APP_URL);

    assert.equal(result.allowed, false);
    assert.match(String(result.reason), /no coincide con el dominio configurado/);
});

test("bloquea un subdominio distinto", () => {
    const result = checkRequestOrigin(
        "https://otro.margarita-production-6a8b.up.railway.app",
        APP_URL
    );

    assert.equal(result.allowed, false);
});

test("bloquea un origen inválido cuando el navegador lo envía", () => {
    const result = checkRequestOrigin("https://malicioso.example/pagina", APP_URL);

    assert.equal(result.allowed, false);
});

test("permite Origin: null (origen opaco del navegador)", () => {
    const result = checkRequestOrigin("null", APP_URL);

    assert.equal(result.allowed, true);
    assert.equal(result.opaqueOrigin, true);
});

test("permite un origen ausente", () => {
    assert.equal(checkRequestOrigin(undefined, APP_URL).allowed, true);
    assert.equal(checkRequestOrigin("", APP_URL).allowed, true);
});

test("el caso opaco no se confunde con un dominio ajeno", () => {
    assert.equal(checkRequestOrigin("null", APP_URL).opaqueOrigin, true);
    assert.equal(checkRequestOrigin("https://evil.com", APP_URL).opaqueOrigin, false);
});

test("el puerto forma parte de la comparación", () => {
    const result = checkRequestOrigin(
        "http://localhost:5173",
        "http://localhost:3000"
    );

    assert.equal(result.allowed, false);
});

test("si APP_URL no se puede leer, no bloquea", () => {
    const result = checkRequestOrigin("https://cualquiera.example", "sin-esquema");

    assert.equal(result.allowed, true);
});
