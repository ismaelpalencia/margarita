import assert from "node:assert/strict";
import test from "node:test";

import { campaignExample, campaignExampleCsv, campaignExampleSpecs } from "./campaign-example";

test("el ejemplo trae teléfono, nombre y una columna por variable", () => {
    const { columns } = campaignExample({ header: true, body: 2, url: true });

    assert.deepEqual(columns, [
        "phone",
        "name",
        "var1",
        "var2",
        "encabezado",
        "enlace"
    ]);
});

test("sin variables, el archivo solo necesita teléfono y nombre", () => {
    const { columns, row } = campaignExample({ header: false, body: 0, url: false });

    assert.deepEqual(columns, ["phone", "name"]);
    assert.equal(row.length, columns.length, "la fila de ejemplo llena todas las columnas");
});

test("el CSV lleva encabezado y fila de ejemplo", () => {
    const csv = campaignExampleCsv({ header: false, body: 1, url: false });
    const [header, row] = csv.split("\n");

    assert.equal(header, "phone,name,var1");
    assert.match(row, /^5215512345678,María,valor 1$/);
});

test("las referencias para el formulario apuntan a las columnas del ejemplo", () => {
    assert.deepEqual(campaignExampleSpecs({ header: true, body: 2, url: true }), {
        body: ["{columna:var1}", "{columna:var2}"],
        header: "{columna:encabezado}",
        url: "{columna:enlace}"
    });
});
