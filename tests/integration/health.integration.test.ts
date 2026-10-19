import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { prisma } from "../../src/config/prisma";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    WorkspaceFixture
} from "./helpers";

/**
 * `/health` tiene que decir dónde viven los archivos.
 *
 * Es el dato que evita activar un cliente sin Volume y descubrirlo cuando la
 * primera actualización le borre las fotos de las conversaciones.
 */

let fixture: WorkspaceFixture;

before(async () => {
    fixture = await createWorkspaceFixture();
});

after(async () => {
    await cleanupWorkspace(fixture.workspaceId);
    await disconnectFixtures();
    await prisma.$disconnect();
});

function baseUrl(): string {
    return process.env.INTEGRATION_BASE_URL || "http://127.0.0.1:3987";
}

test("el healthcheck reporta el almacenamiento de archivos", async () => {
    const minimo = await fetch(`${baseUrl()}/health`);
    const sinDetalle = (await minimo.json()) as Record<string, unknown>;

    assert.equal(minimo.status, 200);
    assert.deepEqual(Object.keys(sinDetalle).sort(), ["ok", "status", "timestamp"]);

    const response = await fetch(`${baseUrl()}/health?token=token-de-prueba`);
    const body = (await response.json()) as {
        storage?: { dir: string; persistent: boolean; message: string };
        checks?: Record<string, boolean>;
    };

    assert.equal(response.status, 200);
    assert.ok(body.storage, "incluye el bloque de almacenamiento");
    assert.equal(typeof body.storage!.persistent, "boolean");
    assert.match(body.storage!.dir, /media/);
    assert.equal(
        body.checks?.mediaStoragePersistent,
        body.storage!.persistent,
        "el check y el detalle dicen lo mismo"
    );
});
