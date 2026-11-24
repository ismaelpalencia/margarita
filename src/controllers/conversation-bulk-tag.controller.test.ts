import assert from "node:assert/strict";
import test from "node:test";

import { conversationBulkTagSchema } from "./conversation-bulk-tag.controller";

const base = { tagIds: ["tag-1"], mode: "add" as const };

test("acepta hasta 25 conversaciones para etiquetar", () => {
    const parsed = conversationBulkTagSchema.safeParse({
        ...base,
        conversationIds: Array.from({ length: 25 }, (_, index) => `conversation-${index}`)
    });
    assert.equal(parsed.success, true);
});

test("rechaza más de 25 conversaciones para etiquetar", () => {
    const parsed = conversationBulkTagSchema.safeParse({
        ...base,
        conversationIds: Array.from({ length: 26 }, (_, index) => `conversation-${index}`)
    });
    assert.equal(parsed.success, false);
});

test("solo acepta modos add, replace o remove", () => {
    const parsed = conversationBulkTagSchema.safeParse({
        conversationIds: ["conversation-1"],
        tagIds: ["tag-1"],
        mode: "clear-all"
    });
    assert.equal(parsed.success, false);
});
