import assert from "node:assert/strict";
import test from "node:test";

import { sendBulkQuickReplySchema } from "./conversation-bulk-quick-reply.controller";

test("acepta hasta 25 conversaciones para una respuesta rápida masiva", () => {
    const result = sendBulkQuickReplySchema.safeParse({
        conversationIds: Array.from({ length: 25 }, (_, index) => `conversation-${index}`),
        quickReplyId: "reply-1"
    });

    assert.equal(result.success, true);
});

test("rechaza selecciones vacías, repetidas o mayores a 25", () => {
    assert.equal(sendBulkQuickReplySchema.safeParse({ conversationIds: [], quickReplyId: "reply-1" }).success, false);
    assert.equal(sendBulkQuickReplySchema.safeParse({ conversationIds: ["same", "same"], quickReplyId: "reply-1" }).success, false);
    assert.equal(sendBulkQuickReplySchema.safeParse({
        conversationIds: Array.from({ length: 26 }, (_, index) => `conversation-${index}`),
        quickReplyId: "reply-1"
    }).success, false);
});
