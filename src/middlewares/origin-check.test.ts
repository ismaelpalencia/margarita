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
    const result = checkRequestOrigin("no-es-una-url", APP_URL);

    assert.equal(result.allowed, false);
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
