import assert from "node:assert/strict";
import test from "node:test";

import { conversationBulkActionSchema } from "./conversation-bulk-action.controller";

test("acepta 25 conversaciones para una acción masiva", () => {
    const parsed = conversationBulkActionSchema.safeParse({
        conversationIds: Array.from({ length: 25 }, (_, index) => `conversation-${index}`),
        action: "read"
    });
    assert.equal(parsed.success, true);
});

test("rechaza más de 25 conversaciones para una acción masiva", () => {
    const parsed = conversationBulkActionSchema.safeParse({
        conversationIds: Array.from({ length: 26 }, (_, index) => `conversation-${index}`),
        action: "close"
    });
    assert.equal(parsed.success, false);
});

test("solo acepta acciones conocidas", () => {
    const parsed = conversationBulkActionSchema.safeParse({
        conversationIds: ["conversation-1"],
        action: "delete-all"
    });
    assert.equal(parsed.success, false);
});
