import assert from "node:assert/strict";
import test from "node:test";

import {
    buildInteractiveButtons,
    buildInteractiveList,
    InteractiveMessageError,
    interactiveListPayload,
    interactivePayload
} from "./interactive-message";

test("arma los botones con identificador propio", () => {
    const message = buildInteractiveButtons({
        body: "¿Puede pagar hoy?",
        footer: "Cobranza",
        titles: ["Sí, pagaré", "No puedo", ""]
    });

    assert.equal(message.buttons.length, 2, "ignora los vacíos");
    assert.equal(message.buttons[0].id, "SI_PAGARE");
    assert.equal(message.buttons[1].id, "NO_PUEDO");

    const payload = interactivePayload({ to: "5215500000000", message });

    assert.equal(payload.type, "interactive");
    assert.equal(payload.interactive.type, "button");
    assert.deepEqual(payload.interactive.action.buttons[0], {
        type: "reply",
        reply: { id: "SI_PAGARE", title: "Sí, pagaré" }
    });
});

test("rechaza más de tres botones", () => {
    assert.throws(
        () =>
            buildInteractiveButtons({
                body: "Hola",
                titles: ["uno", "dos", "tres", "cuatro"]
            }),
        (error: unknown) =>
            error instanceof InteractiveMessageError &&
            /hasta 3 botones/.test(error.message)
    );
});

test("rechaza un botón de más de 20 caracteres", () => {
    assert.throws(
        () =>
            buildInteractiveButtons({
                body: "Hola",
                titles: ["Este botón es demasiado largo"]
            }),
        /20 caracteres/
    );
});

test("rechaza un mensaje sin texto o sin botones", () => {
    assert.throws(() => buildInteractiveButtons({ body: " ", titles: ["a"] }), /texto/);
    assert.throws(() => buildInteractiveButtons({ body: "Hola", titles: [] }), /un botón/);
});

test("dos botones con el mismo texto no se confunden", () => {
    assert.throws(
        () => buildInteractiveButtons({ body: "Hola", titles: ["Sí", "Sí"] }),
        /mismo identificador/
    );
});

test("arma una lista con hasta 10 opciones y su payload", () => {
    const message = buildInteractiveList({
        body: "¿Qué necesitas?",
        footer: "Atención",
        buttonLabel: "Ver opciones",
        sectionTitle: "Menú",
        rows: [
            { title: "Horarios", description: "Cuándo abrimos" },
            { title: "Ubicación", description: "" },
            { title: "", description: "sin título se ignora" }
        ]
    });

    assert.equal(message.rows.length, 2);
    assert.equal(message.buttonLabel, "Ver opciones");
    assert.equal(message.sectionTitle, "Menú");
    assert.equal(message.rows[0].id, "HORARIOS");

    const payload = interactiveListPayload({ to: "5215500000000", message });

    assert.equal(payload.type, "interactive");
    assert.equal(payload.interactive.type, "list");
    assert.equal(payload.interactive.action.button, "Ver opciones");
    assert.deepEqual(payload.interactive.action.sections[0].rows[0], {
        id: "HORARIOS",
        title: "Horarios",
        description: "Cuándo abrimos"
    });
    assert.equal(payload.interactive.action.sections[0].rows[1].description, undefined);
});

test("rechaza más de 10 opciones en una lista", () => {
    const rows = Array.from({ length: 11 }, (_, index) => ({
        title: "Opción " + (index + 1)
    }));

    assert.throws(
        () =>
            buildInteractiveList({
                body: "Hola",
                buttonLabel: "Ver",
                rows
            }),
        /hasta 10 opciones/
    );
});

test("rechaza títulos, descripciones y botón fuera de límite", () => {
    assert.throws(
        () =>
            buildInteractiveList({
                body: "Hola",
                buttonLabel: "Ver",
                rows: [{ title: "Este título pasa de veinticuatro" }]
            }),
        /24 caracteres/
    );

    assert.throws(
        () =>
            buildInteractiveList({
                body: "Hola",
                buttonLabel: "Ver",
                rows: [
                    {
                        title: "Horarios",
                        description:
                            "Esta descripción es demasiado larga para el límite de Meta de setenta y dos caracteres"
                    }
                ]
            }),
        /72 caracteres/
    );

    assert.throws(
        () =>
            buildInteractiveList({
                body: "Hola",
                buttonLabel: "Este botón pasa de veinte",
                rows: [{ title: "Horarios" }]
            }),
        /20 caracteres/
    );
});

test("rechaza una lista sin opciones o sin texto", () => {
    assert.throws(
        () => buildInteractiveList({ body: "Hola", buttonLabel: "Ver", rows: [] }),
        /al menos una opción/
    );
    assert.throws(
        () =>
            buildInteractiveList({
                body: " ",
                buttonLabel: "Ver",
                rows: [{ title: "Horarios" }]
            }),
        /texto/
    );
});

test("respeta el identificador explícito de la opción", () => {
    const message = buildInteractiveList({
        body: "Hola",
        buttonLabel: "Ver",
        rows: [{ title: "Horarios", id: "HORARIO_ATENCION" }]
    });

    assert.equal(message.rows[0].id, "HORARIO_ATENCION");
});
