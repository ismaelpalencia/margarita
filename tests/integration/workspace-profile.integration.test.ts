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

async function visit(path: string, cookie: string) {
    const response = await fetch(`${baseUrl()}${path}`, {
        headers: { cookie },
        redirect: "manual"
    });
    const body = response.status === 200 ? await response.text() : "";

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
    const reportes = await visit("/admin/reports", cookie);

    assert.equal(reportes.status, 200);

    const dashboardCobranza = await visit("/admin/dashboard", cookie);

    assert.equal(dashboardCobranza.status, 200);
    assert.match(dashboardCobranza.body, /Gestiones de hoy/);
    assert.match(dashboardCobranza.body, /Promesas vencidas/);
    assert.match(dashboardCobranza.body, /href="\/admin\/reports"/);
    assert.match(dashboardCobranza.body, /href="\/admin\/replies"/);

    /** Se apaga: las rutas de cobranza dejan de estar disponibles. */
    await changeProfile(cookie, WorkspaceProfile.GENERICO);

    const guardado = await prisma.workspace.findUniqueOrThrow({
        where: { id: fixture.workspaceId },
        select: { profile: true }
    });

    assert.equal(guardado.profile, WorkspaceProfile.GENERICO);

    const reportesApagado = await visit("/admin/reports", cookie);

    assert.equal(reportesApagado.status, 302);
    assert.match(
        reportesApagado.location || "",
        /cobranza_desactivada/,
        "la ruta avisa que el módulo está apagado"
    );

    const botonesApagado = await visit("/admin/replies", cookie);

    assert.equal(botonesApagado.status, 302);

    const dashboardGenerico = await visit("/admin/dashboard", cookie);

    assert.equal(dashboardGenerico.status, 200);
    assert.doesNotMatch(dashboardGenerico.body, /Gestiones de hoy/);
    assert.doesNotMatch(dashboardGenerico.body, /Promesas vencidas/);
    assert.doesNotMatch(dashboardGenerico.body, /href="\/admin\/reports"/);
    assert.doesNotMatch(dashboardGenerico.body, /href="\/admin\/replies"/);

    /** Las pantallas que quedan también se pintan sin el módulo. */
    const pantallasGenericas = [
        "/admin/contacts",
        `/admin/contacts/${contacto.id}/edit`,
        "/admin/system",
        "/admin/guia",
        "/admin/logs/webhooks",
        "/admin/templates"
    ];

    for (const path of pantallasGenericas) {
        const response = await visit(path, cookie);

        assert.equal(response.status, 200, `${path} debe seguir disponible`);
    }

    const aviso = await visit(reportesApagado.location || "/admin/dashboard", cookie);

    assert.equal(aviso.status, 200);
    assert.match(
        aviso.body,
        /módulo de cobranza está apagado/,
        "el dashboard explica por qué se bloqueó la ruta"
    );

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

    const reportesEncendido = await visit("/admin/reports", cookie);

    assert.equal(reportesEncendido.status, 200);

    const dashboardOtraVez = await visit("/admin/dashboard", cookie);

    assert.equal(dashboardOtraVez.status, 200);
    assert.match(dashboardOtraVez.body, /Gestiones de hoy/);
    assert.match(dashboardOtraVez.body, /href="\/admin\/reports"/);
});
