import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { verifyMetaSignature } from "./webhook-signature";

const APP_SECRET = "app-secret-de-prueba";
const BODY = JSON.stringify({
    object: "whatsapp_business_account",
    entry: []
});

function sign(body: string, secret = APP_SECRET) {
    return (
        "sha256=" +
        crypto.createHmac("sha256", secret).update(body).digest("hex")
    );
}

test("acepta una firma correcta", () => {
    assert.equal(
        verifyMetaSignature({
            rawBody: BODY,
            signatureHeader: sign(BODY),
            appSecret: APP_SECRET
        }),
        true
    );
});

test("acepta la firma calculada sobre un Buffer", () => {
    assert.equal(
        verifyMetaSignature({
            rawBody: Buffer.from(BODY, "utf8"),
            signatureHeader: sign(BODY),
            appSecret: APP_SECRET
        }),
        true
    );
});

test("rechaza una firma con otro secreto", () => {
    assert.equal(
        verifyMetaSignature({
            rawBody: BODY,
            signatureHeader: sign(BODY, "otro-secreto"),
            appSecret: APP_SECRET
        }),
        false
    );
});

test("rechaza una firma cuando el cuerpo cambió", () => {
    assert.equal(
        verifyMetaSignature({
            rawBody: BODY + " ",
            signatureHeader: sign(BODY),
            appSecret: APP_SECRET
        }),
        false
    );
});

test("rechaza encabezados con formato inválido", () => {
    const invalidHeaders = [
        null,
        "",
        "sha256=",
        "sha1=abc",
        "sha256=zzzz",
        "sha256=abc123"
    ];

    for (const header of invalidHeaders) {
        assert.equal(
            verifyMetaSignature({
                rawBody: BODY,
                signatureHeader: header,
                appSecret: APP_SECRET
            }),
            false,
            `debe rechazar: ${String(header)}`
        );
    }
});

test("rechaza cuando falta el cuerpo o el secreto", () => {
    assert.equal(
        verifyMetaSignature({
            rawBody: undefined,
            signatureHeader: sign(BODY),
            appSecret: APP_SECRET
        }),
        false
    );

    assert.equal(
        verifyMetaSignature({
            rawBody: BODY,
            signatureHeader: sign(BODY),
            appSecret: ""
        }),
        false
    );
});

test("rechaza un prefijo con mayúsculas (Meta siempre envía sha256=)", () => {
    assert.equal(
        verifyMetaSignature({
            rawBody: BODY,
            signatureHeader: sign(BODY).replace("sha256=", "SHA256="),
            appSecret: APP_SECRET
        }),
        false
    );
});
