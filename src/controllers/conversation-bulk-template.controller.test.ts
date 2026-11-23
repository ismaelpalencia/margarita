import assert from "node:assert/strict";
import test from "node:test";

import { sendBulkTemplateSchema } from "./conversation-bulk-template.controller";

const base = { templateId: "template-1" };

test("acepta hasta 25 conversaciones para plantilla masiva", () => {
    const parsed = sendBulkTemplateSchema.safeParse({
        ...base,
        conversationIds: Array.from({ length: 25 }, (_, index) => `conversation-${index}`)
    });
    assert.equal(parsed.success, true);
});

test("rechaza más de 25 conversaciones", () => {
    const parsed = sendBulkTemplateSchema.safeParse({
        ...base,
        conversationIds: Array.from({ length: 26 }, (_, index) => `conversation-${index}`)
    });
    assert.equal(parsed.success, false);
});

test("rechaza una selección vacía", () => {
    const parsed = sendBulkTemplateSchema.safeParse({
        ...base,
        conversationIds: []
    });
    assert.equal(parsed.success, false);
});
