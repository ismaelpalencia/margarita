import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import {
    ContactOutcomeType,
    WorkspaceProfile
} from "@prisma/client";

import { appConfig } from "../../src/config/app.config";
import { prisma } from "../../src/config/prisma";
import { contactPhoneFields } from "../../src/utils/phone";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    testPhone,
    WorkspaceFixture
} from "./helpers";

/**
 * El interruptor de giro enciende y apaga el módulo de cobranza.
 *
 * Lo importante: apagarlo no borra resultados ni contactos. Solo deja de
 * mostrarlos y bloquea las rutas del módulo; al volver a COBRANZA todo
 * aparece otra vez.
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

async function login(): Promise<string> {
    const response = await fetch(`${baseUrl()}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            email: fixture.adminEmail,
            password: fixture.adminPassword
        }).toString()
    });

    const cookie = response.headers
        .getSetCookie()
        .find((value) => value.startsWith(`${appConfig.cookieName}=`));

    assert.ok(cookie, "el admin de prueba debe poder entrar");

    return cookie!.split(";")[0];
}

async function visit(path: string, cookie: string, accept?: string) {
    const response = await fetch(`${baseUrl()}${path}`, {
        headers: { cookie, ...(accept ? { accept } : {}) },
        redirect: "manual"
    });
    const body = await response.text();

    return { status: response.status, body, location: response.headers.get("location") };
}

async function changeProfile(cookie: string, profile: WorkspaceProfile) {
    const response = await fetch(`${baseUrl()}/admin/system/profile`, {
        method: "POST",
        redirect: "manual",
        headers: {
            cookie,
            "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ profile }).toString()
    });

    assert.equal(response.status, 302, "el cambio de giro debe responder con redirect");
}

test("el giro apaga y enciende cobranza sin borrar datos", async () => {
    const cookie = await login();

    const contacto = await prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(testPhone()),
            customName: "Cliente con promesa",
            outcomeType: ContactOutcomeType.PROMISE,
            outcomeAmount: "1500",
            outcomeDueAt: new Date()
        }
    });

    /** Con COBRANZA encendido, reportes y resultados están visibles. */
    const reportes = await visit("/admin/reports", cookie, "application/json");

    assert.equal(reportes.status, 200);

    const dashboardCobranza = await visit("/admin/dashboard/data", cookie, "application/json");

    assert.equal(dashboardCobranza.status, 200);
    const shellCobranza = await visit("/panel/shell", cookie);
    assert.match(shellCobranza.body, /"collectionsEnabled":true/);
    assert.match(dashboardCobranza.body, /"dashboard"/);

    /** Se apaga: las rutas de cobranza dejan de estar disponibles. */
    await changeProfile(cookie, WorkspaceProfile.GENERICO);

    const guardado = await prisma.workspace.findUniqueOrThrow({
        where: { id: fixture.workspaceId },
        select: { profile: true }
    });

    assert.equal(guardado.profile, WorkspaceProfile.GENERICO);

    const reportesApagado = await visit("/admin/reports", cookie, "application/json");

    assert.equal(reportesApagado.status, 403);
    assert.match(reportesApagado.body, /collections_disabled/, "la API avisa que el módulo está apagado");

    const botonesApagado = await visit("/admin/replies", cookie);

    assert.equal(botonesApagado.status, 302);

    const dashboardGenerico = await visit("/admin/dashboard/data", cookie, "application/json");

    assert.equal(dashboardGenerico.status, 200);
    const shellGenerico = await visit("/panel/shell", cookie);
    assert.match(shellGenerico.body, /"collectionsEnabled":false/);

    /** Las pantallas que quedan también se pintan sin el módulo. */
    const pantallasGenericas = [
        "/panel/admin/contacts",
        `/panel/admin/contacts/${contacto.id}`,
        "/panel/admin/system",
        "/panel/admin/guia",
        "/panel/admin/logs/webhooks",
        "/panel/admin/templates"
    ];

    for (const path of pantallasGenericas) {
        const response = await visit(path, cookie);

        assert.equal(response.status, 200, `${path} debe seguir disponible`);
    }

    assert.equal(shellGenerico.status, 200, "el armazón Angular sigue disponible sin cobranza");

    /** Los datos siguen ahí: el interruptor no borra ni migra nada. */
    const contactoDespues = await prisma.contact.findUniqueOrThrow({
        where: { id: contacto.id },
        select: {
            outcomeType: true,
            outcomeAmount: true,
            outcomeDueAt: true
        }
    });

    assert.equal(contactoDespues.outcomeType, ContactOutcomeType.PROMISE);
    assert.equal(Number(contactoDespues.outcomeAmount), 1500);
    assert.ok(contactoDespues.outcomeDueAt);

    /** Y se puede volver a encender. */
    await changeProfile(cookie, WorkspaceProfile.COBRANZA);

    const reportesEncendido = await visit("/admin/reports", cookie, "application/json");

    assert.equal(reportesEncendido.status, 200);

    const dashboardOtraVez = await visit("/admin/dashboard/data", cookie, "application/json");

    assert.equal(dashboardOtraVez.status, 200);
    const shellOtraVez = await visit("/panel/shell", cookie);
    assert.match(shellOtraVez.body, /"collectionsEnabled":true/);
});
