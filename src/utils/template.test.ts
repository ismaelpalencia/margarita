import assert from "node:assert/strict";
import test from "node:test";

import {
    buildTemplateBodyParameters,
    countTemplateVariables,
    getTemplateBodyText,
    renderTemplatePreview
} from "./template";

const components = [
    { type: "HEADER", format: "TEXT", text: "Hola" },
    {
        type: "BODY",
        text: "Hola {{1}}, tu pedido {{2}} está listo en {{3}}."
    },
    { type: "FOOTER", text: "Margarita" }
];

test("extrae el texto del componente BODY", () => {
    assert.equal(
        getTemplateBodyText(components),
        "Hola {{1}}, tu pedido {{2}} está listo en {{3}}."
    );
});

test("tolera componentes vacíos o inválidos", () => {
    assert.equal(getTemplateBodyText(null), "");
    assert.equal(getTemplateBodyText("no-es-arreglo"), "");
    assert.equal(getTemplateBodyText([{ type: "HEADER", text: "x" }]), "");
    assert.equal(getTemplateBodyText([]), "");
});

test("cuenta las variables de la plantilla", () => {
    assert.equal(countTemplateVariables(components), 3);
    assert.equal(countTemplateVariables([{ type: "BODY", text: "Sin variables" }]), 0);
    assert.equal(
        countTemplateVariables([{ type: "BODY", text: "{{ 1 }} y {{2}}" }]),
        2
    );
});

test("renderiza la vista previa reemplazando variables", () => {
    assert.equal(
        renderTemplatePreview(components, ["Ana", "A-102", "sucursal Centro"]),
        "Hola Ana, tu pedido A-102 está listo en sucursal Centro."
    );
});

test("deja visibles las variables que no se llenaron", () => {
    assert.equal(
        renderTemplatePreview(
            [{ type: "BODY", text: "Hola {{1}} de {{2}}" }],
            ["Ana"]
        ),
        "Hola Ana de {{2}}"
    );
});

test("construye los parámetros ignorando valores vacíos", () => {
    assert.deepEqual(buildTemplateBodyParameters(["Ana", "", "  ", "Centro"]), [
        { type: "text", text: "Ana" },
        { type: "text", text: "Centro" }
    ]);
});

test("sin variables no genera componentes", () => {
    assert.deepEqual(buildTemplateBodyParameters(["", "   "]), []);
});
