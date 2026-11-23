import assert from "node:assert/strict";
import test from "node:test";

import { buildBlockUsersPayload } from "./whatsapp-cloud-operations.service";

test("el bloqueo usa el campo de usuario que espera Meta", () => {
    assert.deepEqual(buildBlockUsersPayload(["5215512345678"]), {
        messaging_product: "whatsapp",
        block_users: [{ user: "5215512345678" }]
    });
});
