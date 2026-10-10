import assert from "node:assert/strict";
import test from "node:test";

import { collectMissingVariables, REQUIRED_VARIABLES } from "./seed";

const completeEnv = {
    WORKSPACE_NAME: "Ferretería López",
    WORKSPACE_SLUG: "ferreteria-lopez",
    ADMIN_NAME: "Ismael",
    ADMIN_EMAIL: "admin@ejemplo.com",
    ADMIN_PASSWORD: "ClaveSegura123",
    META_ACCESS_TOKEN: "EAAG...",
    META_PHONE_NUMBER_ID: "123",
    META_BUSINESS_ACCOUNT_ID: "456",
    META_VERIFY_TOKEN: "token",
    META_PHONE_NUMBER: "5215500000000"
};

test("sin faltantes devuelve una lista vacía", () => {
    assert.deepEqual(collectMissingVariables(completeEnv), []);
});

test("reporta todas las variables faltantes de una sola vez", () => {
    const missing = collectMissingVariables({
        WORKSPACE_NAME: "Ferretería López",
        ADMIN_EMAIL: "admin@ejemplo.com"
    });

    assert.ok(missing.includes("ADMIN_PASSWORD"));
    assert.ok(missing.includes("META_ACCESS_TOKEN"));
    assert.equal(missing.length, REQUIRED_VARIABLES.length - 2);
});

test("trata los valores vacíos o con espacios como faltantes", () => {
    const missing = collectMissingVariables({
        ...completeEnv,
        ADMIN_PASSWORD: "   ",
        META_VERIFY_TOKEN: ""
    });

    assert.deepEqual(missing.sort(), ["ADMIN_PASSWORD", "META_VERIFY_TOKEN"]);
});

test("las variables que exige el seed son las diez esperadas", () => {
    assert.equal(REQUIRED_VARIABLES.length, 10);
    assert.ok(REQUIRED_VARIABLES.includes("ADMIN_EMAIL"));
    assert.ok(REQUIRED_VARIABLES.includes("META_PHONE_NUMBER"));
});
