import assert from "node:assert/strict";
import test from "node:test";

import {
    buildOrderedParameters,
    normalizeHeaderKey,
    resolveVariableSpec,
    resolveVariableSpecs
} from "./campaign-variables";

const context = {
    name: "Ana López",
    phone: "5215500000001",
    columns: {
        pedido: "A-102",
        sucursal: "Centro",
        total: "$450"
    }
};

test("normaliza encabezados sin acentos ni mayúsculas", () => {
    assert.equal(normalizeHeaderKey("  Pedí-do  "), "pedi-do");
    assert.equal(normalizeHeaderKey("SUCURSAL"), "sucursal");
});

test("resuelve el nombre y el teléfono del contacto", () => {
    assert.equal(resolveVariableSpec("{nombre}", context).value, "Ana López");
    assert.equal(
        resolveVariableSpec("{telefono}", context).value,
        "5215500000001"
    );
});

test("resuelve columnas del archivo sin importar mayúsculas", () => {
    assert.equal(
        resolveVariableSpec("{columna:Pedido}", context).value,
        "A-102"
    );
    assert.equal(
        resolveVariableSpec("{columna: SUCURSAL }", context).value,
        "Centro"
    );
});

test("permite mezclar texto fijo con referencias", () => {
    assert.equal(
        resolveVariableSpec(
            "Hola {nombre}, tu pedido {columna:pedido} va para {columna:sucursal}.",
            context
        ).value,
        "Hola Ana López, tu pedido A-102 va para Centro."
    );
});

test("deja las llaves desconocidas tal cual", () => {
    const spec = "Descuento del {50%} {descuento}";

    assert.equal(resolveVariableSpec(spec, context).value, spec);
});

test("reporta las columnas que no existen", () => {
    const result = resolveVariableSpec("{columna:Factura}", context);

    assert.equal(result.value, "");
    assert.deepEqual(result.missingColumns, ["Factura"]);
});

test("un nombre vacío resuelve a cadena vacía", () => {
    const result = resolveVariableSpec("{nombre}", { ...context, name: null });

    assert.equal(result.value, "");
});

test("resuelve un arreglo completo y junta las columnas faltantes", () => {
    const result = resolveVariableSpecs(
        ["Hola {nombre}", "{columna:pedido}", "{columna:Factura}"],
        context
    );

    assert.deepEqual(result.values, ["Hola Ana López", "A-102", ""]);
    assert.deepEqual(result.missingColumns, ["Factura"]);
});

test("los parámetros conservan el orden y el número de variables", () => {
    const parameters = buildOrderedParameters(["Ana", "", "Centro"]);

    assert.deepEqual(parameters, [
        { type: "text", text: "Ana" },
        { type: "text", text: "" },
        { type: "text", text: "Centro" }
    ]);
});
