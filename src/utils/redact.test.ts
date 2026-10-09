import assert from "node:assert/strict";
import test from "node:test";

import { redactSensitive } from "./redact";

test("oculta tokens y contraseñas", () => {
    const result = redactSensitive({
        access_token: "EAAG123",
        verifyToken: "secreto",
        password: "admin123",
        Authorization: "Bearer xyz"
    }) as Record<string, unknown>;

    assert.equal(result.access_token, "[redactado]");
    assert.equal(result.verifyToken, "[redactado]");
    assert.equal(result.password, "[redactado]");
    assert.equal(result.Authorization, "[redactado]");
});

test("conserva los datos necesarios para operar", () => {
    const result = redactSensitive({
        phone: "5215500000001",
        contact: {
            name: "Cliente",
            wa_id: "5215500000001"
        },
        messages: [{ id: "wamid.X", text: { body: "Hola" } }]
    }) as Record<string, unknown>;

    assert.equal(result.phone, "5215500000001");
    assert.deepEqual(result.messages, [
        {
            id: "wamid.X",
            text: {
                body: "Hola"
            }
        }
    ]);
});

test("redacta en estructuras anidadas y arreglos", () => {
    const result = redactSensitive({
        entry: [
            {
                changes: [
                    {
                        value: {
                            metadata: {
                                access_token: "EAAG",
                                phone_number_id: "123"
                            }
                        }
                    }
                ]
            }
        ]
    }) as {
        entry: Array<{
            changes: Array<{ value: { metadata: Record<string, unknown> } }>;
        }>;
    };

    assert.equal(
        result.entry[0].changes[0].value.metadata.access_token,
        "[redactado]"
    );
    assert.equal(
        result.entry[0].changes[0].value.metadata.phone_number_id,
        "123"
    );
});

test("no falla con valores nulos o primitivos", () => {
    assert.equal(redactSensitive(null), null);
    assert.equal(redactSensitive(undefined), undefined);
    assert.equal(redactSensitive("texto"), "texto");
    assert.equal(redactSensitive(42), 42);
});
