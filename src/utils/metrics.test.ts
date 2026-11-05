import assert from "node:assert/strict";
import test from "node:test";

import { percentile } from "./metrics";

test("percentil vacío devuelve null", () => {
    assert.equal(percentile([], 50), null);
});

test("mediana y p90 con datos pequeños", () => {
    assert.equal(percentile([5, 15, 25], 50), 15);
    assert.equal(percentile([5, 15, 25], 90), 25);
    assert.equal(percentile([1], 50), 1);
});

test("no muta el arreglo original", () => {
    const values = [3, 1, 2];

    percentile(values, 50);

    assert.deepEqual(values, [3, 1, 2]);
});