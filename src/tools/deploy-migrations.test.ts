import assert from "node:assert/strict";
import test from "node:test";

import { decidePlan, INIT_MIGRATION } from "./deploy-migrations";

test("base nueva: aplica todas las migraciones", () => {
    assert.equal(
        decidePlan({ migrationsTable: false, appTables: false }),
        "fresh"
    );
});

test("base existente sin historial: primero hace baseline", () => {
    assert.equal(
        decidePlan({ migrationsTable: false, appTables: true }),
        "baseline"
    );
});

test("base con historial: solo despliega lo pendiente", () => {
    assert.equal(
        decidePlan({ migrationsTable: true, appTables: true }),
        "deploy-only"
    );
});

test("historial sin tablas de la app: solo despliega", () => {
    assert.equal(
        decidePlan({ migrationsTable: true, appTables: false }),
        "deploy-only"
    );
});

test("el nombre de la migración inicial no cambia", () => {
    assert.equal(INIT_MIGRATION, "20261009000000_init");
});
