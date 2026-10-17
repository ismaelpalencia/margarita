import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { UserRole } from "@prisma/client";

import { appConfig } from "../../src/config/app.config";
import { prisma } from "../../src/config/prisma";
import { UserService } from "../../src/services/user.service";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    WorkspaceFixture
} from "./helpers";

/**
 * El cupo del panel es **por persona**, no por dirección de internet.
 *
 * Antes, quince agentes en la misma oficina compartían 300 peticiones y los
 * últimos del día recibían 429. Aquí se mandan 315 peticiones desde la misma IP
 * (15 usuarios × 21) y **todas** tienen que responder 200: con el tope por IP
 * de antes, las últimas habrían fallado.
 */

const USERS = 15;
const REQUESTS_PER_USER = 21;

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

async function login(email: string, password: string): Promise<string> {
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

test("quince agentes desde la misma IP no se estorban entre sí", async () => {
    const password = "ClaveDeCupo123";
    const cookies: string[] = [];

    for (let index = 0; index < USERS; index++) {
        const email = `prueba-integracion-cupo-${index}-${Date.now()}@ejemplo.mx`;

        await UserService.createUser(fixture.workspaceId, {
            name: `Agente de cupo ${index}`,
            email,
            password,
            role: UserRole.AGENT,
            canSendManualMessages: true,
            manualMessageLimit: 10
        });

        const cookie = await login(email, password);
        assert.ok(cookie, `el agente ${index} debe poder entrar`);
        cookies.push(cookie);
    }

    const fallidas: string[] = [];

    for (let round = 0; round < REQUESTS_PER_USER; round++) {
        const responses = await Promise.all(
            cookies.map((cookie) =>
                fetch(`${baseUrl()}/agent/dashboard`, {
                    headers: { cookie },
                    redirect: "manual"
                })
            )
        );

        responses.forEach((response, index) => {
            if (response.status !== 200) {
                fallidas.push(`vuelta ${round}, agente ${index}: ${response.status}`);
            }
        });
    }

    assert.deepEqual(
        fallidas,
        [],
        `las ${USERS * REQUESTS_PER_USER} peticiones (más que el tope por IP de antes) deben pasar`
    );
});
