import assert from "node:assert/strict";
import test from "node:test";

import { webhookTelemetry } from "./webhook-telemetry.service";

test("el snapshot refleja lo recibido, encolado y rechazado", () => {
    const before = webhookTelemetry.getSnapshot();

    webhookTelemetry.recordReceived();
    webhookTelemetry.recordRejected("Firma inválida.");
    webhookTelemetry.recordReceived();
    webhookTelemetry.recordEnqueued();

    const after = webhookTelemetry.getSnapshot();

    assert.equal(after.received, before.received + 2);
    assert.equal(after.enqueued, before.enqueued + 1);
    assert.equal(after.rejected, before.rejected + 1);
    assert.equal(after.lastRejectionReason, "Firma inválida.");
    assert.ok(after.lastReceivedAt instanceof Date);
    assert.ok(after.lastEnqueuedAt instanceof Date);
});
