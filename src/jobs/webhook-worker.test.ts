import assert from "node:assert/strict";
import test from "node:test";

import { isMissingSchemaError, webhookWorkerState } from "./webhook-worker";

test("reconoce el código P2021 (tabla faltante)", () => {
    assert.equal(isMissingSchemaError({ code: "P2021" }), true);
});

test("reconoce el código P2022 (columna faltante)", () => {
    assert.equal(isMissingSchemaError({ code: "P2022" }), true);
});

test("reconoce el mensaje de Prisma sobre una tabla inexistente", () => {
    assert.equal(
        isMissingSchemaError(
            new Error(
                "Invalid `prisma.webhookEvent.count()` invocation:\n\nThe table `public.WebhookEvent` does not exist in the current database."
            )
        ),
        true
    );
});

test("reconoce el mensaje crudo de PostgreSQL", () => {
    assert.equal(
        isMissingSchemaError(
            new Error('relation "public.WebhookEvent" does not exist at character 8')
        ),
        true
    );
});

test("reconoce una columna faltante", () => {
    assert.equal(
        isMissingSchemaError(
            new Error(
                "The column `User.lockedUntil` does not exist in the current database."
            )
        ),
        true
    );
});

test("no confunde otros errores con un esquema atrasado", () => {
    const otherErrors = [
        new Error("Can't reach database server at localhost:5432"),
        new Error("Connection pool timeout"),
        new Error("Unique constraint failed on the fields: (`wamid`)"),
        null,
        undefined,
        "texto suelto",
        { code: "P2002" }
    ];

    for (const error of otherErrors) {
        assert.equal(
            isMissingSchemaError(error),
            false,
            `no debería marcarlo como esquema faltante: ${JSON.stringify(error)}`
        );
    }
});

test("el estado inicial del worker asume un esquema listo", () => {
    assert.equal(webhookWorkerState.schemaReady, true);
    assert.equal(webhookWorkerState.pausedUntil, null);
});
