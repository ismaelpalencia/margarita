import assert from "node:assert/strict";
import test from "node:test";

import { HealthCheckClient, HealthService } from "./health.service";

// El cliente de base de datos se inyecta, así que estos tests nunca abren
// una conexión real.
function fakeClient(options: {
    queueThrows?: Error;
    databaseDown?: Error;
}): HealthCheckClient {
    return {
        $queryRaw: async () => {
            if (options.databaseDown) {
                throw options.databaseDown;
            }

            return [{ ok: 1 }];
        },
        user: {
            count: async () => 1
        },
        webhookEvent: {
            count: async () => {
                if (options.queueThrows) {
                    throw options.queueThrows;
                }

                return 0;
            },
            findFirst: async () => null
        }
    };
}

test("reporta unhealthy sin lanzar cuando falta la tabla de la cola", async () => {
    const tableMissing = new Error(
        "The table `public.WebhookEvent` does not exist in the current database."
    );

    const status = await HealthService.getStatus(
        fakeClient({ queueThrows: tableMissing })
    );

    assert.equal(status.status, "unhealthy");
    assert.equal(status.httpStatus, 503);
    assert.equal(status.queue.readable, false);
    assert.match(String(status.queue.error), /does not exist/);
    assert.ok(
        status.migrationHint,
        "debe incluir la pista de migraciones pendientes"
    );
    assert.equal(status.checks.webhookQueueReadable, false);
});

test("reporta healthy cuando todo responde", async () => {
    const status = await HealthService.getStatus(fakeClient({}));

    assert.equal(status.status, "healthy");
    assert.equal(status.httpStatus, 200);
    assert.equal(status.database, "up");
    assert.equal(status.queue.readable, true);
    assert.equal(status.migrationHint, null);
});

test("reporta unhealthy si la base no responde", async () => {
    const status = await HealthService.getStatus(
        fakeClient({
            databaseDown: new Error("Can't reach database server")
        })
    );

    assert.equal(status.status, "unhealthy");
    assert.equal(status.httpStatus, 503);
    assert.equal(status.database, "down");
});
