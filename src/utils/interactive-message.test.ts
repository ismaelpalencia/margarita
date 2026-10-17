import assert from "node:assert/strict";
import test from "node:test";

import {
    buildInteractiveButtons,
    InteractiveMessageError,
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
