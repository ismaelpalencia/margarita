import assert from "node:assert/strict";
import test from "node:test";

import {
    describeMetaError,
    explainMetaError,
    extractMetaError
} from "./meta-error";

const sendFailure = {
    status: 400,
    data: {
        error: {
            message: "There was a payment issue with your account.",
            type: "OAuthException",
            code: 131042,
            error_subcode: 2494108,
            error_data: {
                details: "Payment method is missing."
            }
        }
    },
    message: "Request failed with status code 400"
};

const statusFailure = {
    previousMetaResponse: { messages: [{ id: "wamid.X" }] },
    latestStatusWebhook: {
        id: "wamid.X",
        status: "failed",
        errors: [
            {
                code: 131026,
                title: "Message undeliverable",
                message: "Message could not be delivered."
            }
        ]
    }
};

test("extrae el error de una respuesta de envío rechazada", () => {
    const error = extractMetaError(sendFailure);

    assert.ok(error);
    assert.equal(error!.code, "131042");
    assert.equal(error!.subcode, "2494108");
});

test("extrae el error del webhook de estado", () => {
    const error = extractMetaError(statusFailure);

    assert.ok(error);
    assert.equal(error!.code, "131026");
    assert.equal(error!.title, "Message undeliverable");
});

test("devuelve null cuando no hay error", () => {
    assert.equal(extractMetaError({ messages: [{ id: "wamid.X" }] }), null);
    assert.equal(extractMetaError(null), null);
    assert.equal(extractMetaError("texto"), null);
    assert.equal(
        extractMetaError({ latestStatusWebhook: { status: "delivered" } }),
        null
    );
});

test("traduce el error de pago que bloqueaba los envíos", () => {
    const description = describeMetaError(sendFailure);

    assert.ok(description);
    assert.match(description!, /Problema de pago/);
    assert.match(description!, /método de pago/);
});

test("traduce el código de destinatario no permitido", () => {
    assert.match(
        String(explainMetaError("131030")),
        /lista de destinatarios permitidos/
    );
});

test("describe un código desconocido con el detalle de Meta", () => {
    const description = describeMetaError({
        errors: [{ code: 999999, message: "Algo raro pasó." }]
    });

    assert.equal(description, "Código 999999: Algo raro pasó.");
});
