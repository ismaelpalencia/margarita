import assert from "node:assert/strict";
import test from "node:test";
import { forwardCallingWebhook, withoutCallChanges } from "../services/calls-webhook-forwarder";

const callsPayload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "calls", value: { metadata: { phone_number_id: "pnid" }, calls: [{ id: "call-1", session: { sdp_type: "offer", sdp: "private-sdp" } }] } }] }]
};

test("reenviar el webhook calls al servicio con el secreto interno", async () => {
    let request: RequestInit | undefined;
    await forwardCallingWebhook(callsPayload, {
        serviceUrl: "https://calls.example.test",
        internalSecret: "internal-secret",
        fetcher: async (_input, init) => {
            request = init;
            return new Response("{}", { status: 202 });
        }
    });
    assert.equal(request?.headers && (request.headers as Record<string, string>).Authorization, "Bearer internal-secret");
    assert.equal(JSON.parse(String(request?.body)).entry[0].changes[0].value.calls[0].session.sdp, "private-sdp");
});

test("el servicio de llamadas solo recibe changes calls, no mensajes del cliente", async () => {
    const mixed = { ...callsPayload, entry: [{ changes: [...callsPayload.entry[0].changes, { field: "messages", value: { messages: [{ id: "message-1", text: { body: "dato privado" } }] } }] }] };
    let forwarded = "";
    await forwardCallingWebhook(mixed, {
        serviceUrl: "https://calls.example.test",
        internalSecret: "internal-secret",
        fetcher: async (_input, init) => {
            forwarded = String(init?.body);
            return new Response("{}", { status: 202 });
        }
    });
    assert.equal(forwarded.includes('"field":"messages"'), false);
    assert.equal(forwarded.includes("dato privado"), false);
    assert.equal(forwarded.includes("private-sdp"), true);
});

test("la cola de Margarita descarta eventos calls y SDP", () => {
    const mixed = { ...callsPayload, entry: [{ changes: [...callsPayload.entry[0].changes, { field: "messages", value: { messages: [{ id: "message-1" }] } }] }] };
    const clean = withoutCallChanges(mixed);
    assert.deepEqual(clean.entry?.[0].changes?.map((change) => change.field), ["messages"]);
    assert.equal(JSON.stringify(clean).includes("private-sdp"), false);
});
