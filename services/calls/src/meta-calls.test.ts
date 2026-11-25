import assert from "node:assert/strict";
import test from "node:test";
import { parseCallWebhooks, sendMetaCallAction } from "./meta-calls";

test("parsea llamadas entrantes con offer y llamadas salientes correlacionadas", () => {
  const result = parseCallWebhooks({ entry: [{ changes: [{ field: "calls", value: { metadata: { phone_number_id: "pnid" }, calls: [
    { id: "meta-call", event: "connect", direction: "USER_INITIATED", from: "5215550000000", session: { sdp_type: "offer", sdp: "SDP-OFFER" } },
    { id: "meta-out", event: "connect", direction: "BUSINESS_INITIATED", biz_opaque_callback_data: "internal-id", session: { sdp_type: "answer", sdp: "SDP-ANSWER" } }
  ] } }] }] });
  assert.equal(result.length, 2);
  assert.equal(result[0].sdp, "SDP-OFFER");
  assert.equal(result[1].callbackData, "internal-id");
});

test("envía accept con la respuesta SDP sin registrar el token", async () => {
  let sent: Record<string, unknown> = {};
  await sendMetaCallAction({ apiVersion: "v23.0", phoneNumberId: "pnid", accessToken: "secret-token", action: "accept", callId: "call-1", sdp: "answer-sdp", fetcher: async (_url, init) => { sent = JSON.parse(String(init?.body)); assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret-token"); return Response.json({ success: true }); } });
  assert.deepEqual(sent, { messaging_product: "whatsapp", action: "accept", call_id: "call-1", session: { sdp_type: "answer", sdp: "answer-sdp" } });
});
