import assert from "node:assert/strict";
import test from "node:test";

import {
    buildTemplateBodyParameters,
    buildTemplateMessagePayload,
    countTemplateVariables,
    getTemplateBodyText,
    getTemplateButtons,
    getTemplateHeaderText,
    missingTemplateVariables,
    normalizeTemplateVariables,
    renderTemplatePreview,
    templateVariableShape
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

test("el payload de plantilla sin variables no incluye componentes", () => {
    const payload = buildTemplateMessagePayload({
        to: "5215500000000",
        name: "recordatorio",
        language: "es_MX",
        variables: []
    });

    assert.equal(payload.template.components, undefined);
    assert.deepEqual(payload, {
        messaging_product: "whatsapp",
        to: "5215500000000",
        type: "template",
        template: {
            name: "recordatorio",
            language: { code: "es_MX" }
        }
    });
});

test("el payload incluye un parámetro por variable, en orden", () => {
    const payload = buildTemplateMessagePayload({
        to: "5215500000000",
        name: "pedido",
        language: "es_MX",
        variables: ["Ana", "", "Centro"]
    });

    assert.deepEqual(payload.template.components, [
        {
            type: "body",
            parameters: [
                { type: "text", text: "Ana" },
                { type: "text", text: "" },
                { type: "text", text: "Centro" }
            ]
        }
    ]);
});

test("el payload conserva el número de variables aunque haya valores vacíos", () => {
    const payload = buildTemplateMessagePayload({
        to: "5215500000000",
        name: "pedido",
        language: "es_MX",
        variables: ["", ""]
    });

    assert.equal(payload.template.components?.[0].parameters.length, 2);
});


/**
 * Plantillas con botones (fase 2 de las interacciones).
 *
 * Meta admite una variable en el encabezado y una al final de la URL de un
 * botón. El envío tiene que llevar exactamente los componentes que la plantilla
 * pide: uno de más (o uno vacío) y el mensaje se rechaza.
 */
const conBoton = [
    {
        type: "HEADER",
        format: "TEXT",
        text: "Crédito {{1}}"
    },
    {
        type: "BODY",
        text: "Estimado(a) {{1}}: su saldo es {{2}}."
    },
    {
        type: "FOOTER",
        text: "Los pagos se realizan directamente al acreedor"
    },
    {
        type: "BUTTONS",
        buttons: [
            { type: "QUICK_REPLY", text: "Ya pagué" },
            { type: "QUICK_REPLY", text: "Necesito plazo" },
            { type: "URL", text: "Ver mi cuenta", url: "https://ejemplo.mx/cuenta/{{1}}" }
        ]
    }
];

test("se leen el encabezado y los botones de la plantilla", () => {
    assert.equal(getTemplateHeaderText(conBoton), "Crédito {{1}}");

    const buttons = getTemplateButtons(conBoton);

    assert.equal(buttons.length, 3, "tres botones");
    assert.equal(buttons[0].type, "QUICK_REPLY");
    assert.equal(buttons[0].hasUrlVariable, false);
    assert.equal(buttons[2].type, "URL", "el de enlace se distingue");
    assert.equal(
        buttons[2].hasUrlVariable,
        true,
        "y se detecta que lleva variable al final"
    );
});

test("la forma de la plantilla dice cuántas variables pide cada parte", () => {
    assert.deepEqual(templateVariableShape(conBoton), {
        body: 2,
        header: 1,
        url: 1
    });

    /** Una plantilla sencilla sigue siendo solo cuerpo. */
    assert.deepEqual(
        templateVariableShape([{ type: "BODY", text: "Hola {{1}}" }]),
        { body: 1, header: 0, url: 0 }
    );

    /** Un botón de URL sin variable no pide nada. */
    assert.deepEqual(
        templateVariableShape([
            { type: "BODY", text: "Hola" },
            { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver", url: "https://ejemplo.mx" }] }
        ]),
        { body: 0, header: 0, url: 0 }
    );
});

test("lo que sobra se recorta y lo que falta se avisa por su nombre", () => {
    const usado = normalizeTemplateVariables(conBoton, {
        body: ["María", "$6,491.77", "sobra"],
        header: "CP-20260001",
        button: "CP-20260001"
    });

    assert.deepEqual(usado.body, ["María", "$6,491.77"], "el cuerpo se recorta");
    assert.equal(usado.header, "CP-20260001");
    assert.equal(usado.button, "CP-20260001");

    assert.deepEqual(missingTemplateVariables(conBoton, usado), []);

    const incompleto = normalizeTemplateVariables(conBoton, { body: ["María", ""] });

    assert.deepEqual(
        missingTemplateVariables(conBoton, incompleto),
        ["cuerpo", "encabezado", "botón de enlace"],
        "y se dice cuál falta, no solo que falta algo"
    );
});

test("el envío lleva los tres componentes, en su orden", () => {
    const payload = buildTemplateMessagePayload({
        to: "5215500000000",
        name: "recordatorio_pago_con_opciones",
        language: "es_MX",
        variables: ["María", "$6,491.77"],
        header: "CP-20260001",
        button: "CP-20260001"
    });

    assert.deepEqual(payload.template.components, [
        { type: "header", parameters: [{ type: "text", text: "CP-20260001" }] },
        {
            type: "body",
            parameters: [
                { type: "text", text: "María" },
                { type: "text", text: "$6,491.77" }
            ]
        },
        {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: "CP-20260001" }]
        }
    ]);
});

test("una plantilla sin encabezado ni botón no manda componentes de más", () => {
    const payload = buildTemplateMessagePayload({
        to: "5215500000000",
        name: "aviso",
        language: "es_MX",
        variables: ["Hola"],
        header: "",
        button: ""
    });

    assert.deepEqual(payload.template.components, [
        { type: "body", parameters: [{ type: "text", text: "Hola" }] }
    ]);
});
