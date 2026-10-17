import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { appConfig } from "../../src/config/app.config";
import { prisma } from "../../src/config/prisma";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    WorkspaceFixture
} from "./helpers";

/**
 * El tramo del mes se ve en Admin → WhatsApp.
 *
 * La consulta agrupa en la base (servicio, utilidad y marketing por número), así
 * que esta prueba también comprueba que ese SQL corre contra PostgreSQL real.
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

async function login(email: string, password: string) {
    const response = await fetch(`${baseUrl()}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email, password }).toString()
    });

    const cookie = response.headers
        .getSetCookie()
        .find((value) => value.startsWith(`${appConfig.cookieName}=`));

    return cookie ? cookie.split(";")[0] : "";
}

test("Admin → WhatsApp muestra el tramo del mes por número", async () => {
    const cookie = await login(fixture.adminEmail, fixture.adminPassword);
    const response = await fetch(`${baseUrl()}/admin/whatsapp`, {
        headers: { cookie },
        redirect: "manual"
    });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Tramo del mes/, "la sección existe");
    assert.match(body, /de\s*<strong>?1000|1000 mensajes/, "muestra el tope del tramo");
    assert.match(body, /Plantillas de utilidad/, "separa las plantillas del servicio");
});
