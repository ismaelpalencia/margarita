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
 * Todas las pantallas responden.
 *
 * Esta suite existe por un error real en producción: una plantilla EJS
 * preguntaba por una variable que no todas las rutas le pasaban, así que un
 * inicio de sesión fallido o el cambio de contraseña terminaban en un error 500
 * en lugar de mostrar el aviso. Recorre las pantallas de verdad, con una sesión
 * de verdad, y además visita las rutas que sólo se pintan en los caminos
 * "raros" (contraseña equivocada, contraseña recién cambiada, respaldo
 * verificado), que es donde se esconden.
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

    return { response, cookie: cookie ? cookie.split(";")[0] : "" };
}

async function visit(path: string, cookie: string) {
    const response = await fetch(`${baseUrl()}${path}`, {
        headers: cookie ? { cookie } : {},
        redirect: "manual"
    });

    const body = response.status === 200 ? await response.text() : "";

    return { status: response.status, body };
}

test("ninguna pantalla del panel responde 500", async () => {
    const { cookie } = await login(fixture.adminEmail, fixture.adminPassword);

    assert.ok(cookie, "el admin de prueba debe poder entrar");

    const member = await UserService.createUser(fixture.workspaceId, {
        name: "Persona de pantallas",
        email: `prueba-integracion-pantallas-${Date.now()}@ejemplo.mx`,
        password: "ClaveDePantallas123",
        role: UserRole.AGENT,
        canSendManualMessages: true,
        manualMessageLimit: 10
    });

    /** Las pantallas de siempre. Si alguna truena, aquí se ve. */
    const pantallas = [
        "/",
        "/como-empezar",
        "/guia",
        "/aviso-de-privacidad",
        "/admin/dashboard",
        "/admin/conversations",
        "/admin/contacts",
        "/admin/contacts/new",
        `/admin/contacts/${fixture.adminId}/edit`,
        "/admin/campaigns",
        "/admin/campaigns/create",
        "/admin/quick-replies",
        "/admin/replies",
        "/admin/tags",
        "/admin/tags/new",
        "/admin/templates",
        "/admin/reports",
        "/admin/reports?vista=hoy",
        "/admin/users",
        "/admin/users/new",
        `/admin/users/${member.id}/edit`,
        "/admin/sessions",
        "/admin/logs",
        "/admin/logs/webhooks",
        "/admin/system",
        "/admin/roadmap",
        "/admin/whatsapp",
        "/admin/backup",
        "/admin/backup?success=snapshot",
        "/admin/backup?success=verified&rows=3",
        "/admin/backup?error=purge",
        "/account/password",
        "/account/security",
        "/auth/login",
        "/auth/login?error=idle",
        "/auth/login?success=setup",
        "/auth/login?error=revoked"
    ];

    const fallidas: string[] = [];

    for (const path of pantallas) {
        const { status } = await visit(path, cookie);

        if (status >= 500) {
            fallidas.push(`${path} → ${status}`);
        }
    }

    assert.deepEqual(fallidas, [], "ninguna pantalla debe responder 500");

    /** Y las del agente, que tienen su propio menú y sus propias pantallas. */
    const email = `prueba-integracion-agente-${Date.now()}@ejemplo.mx`;
    const password = "ClaveDeAgente123";

    await UserService.createUser(fixture.workspaceId, {
        name: "Agente de pantallas",
        email,
        password,
        role: UserRole.AGENT,
        canSendManualMessages: true,
        manualMessageLimit: 10
    });

    const agente = await login(email, password);

    assert.ok(agente.cookie, "el agente debe poder entrar");

    const pantallasDelAgente = [
        "/agent/dashboard",
        "/agent/conversations",
        "/agent/sessions",
        "/account/password",
        "/account/security"
    ];

    const fallidasAgente: string[] = [];

    for (const path of pantallasDelAgente) {
        const { status } = await visit(path, agente.cookie);

        if (status >= 500) {
            fallidasAgente.push(`${path} → ${status}`);
        }
    }

    assert.deepEqual(fallidasAgente, [], "las pantallas del agente tampoco");
});

test("los caminos de error también pintan pantalla", async () => {
    /** Credenciales incorrectas: es el camino más común de todos. */
    const equivocada = await fetch(`${baseUrl()}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            email: fixture.adminEmail,
            password: "NoEsLaBuena123"
        }).toString()
    });

    assert.equal(
        equivocada.status,
        400,
        "una contraseña equivocada responde 400, no 500"
    );
    assert.match(
        await equivocada.text(),
        /Credenciales incorrectas/,
        "y lo dice en pantalla"
    );

    /** Falta un dato del formulario: también tiene que pintar el aviso. */
    const vacio = await fetch(`${baseUrl()}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email: "no-es-un-correo", password: "" }).toString()
    });

    assert.equal(vacio.status, 400, "un formulario inválido responde 400");
});

test("cambiar la contraseña no rompe la pantalla de confirmación", async () => {
    const email = `prueba-integracion-password-${Date.now()}@ejemplo.mx`;
    const original = "ClaveOriginal123";

    await UserService.createUser(fixture.workspaceId, {
        name: "Persona que cambia",
        email,
        password: original,
        role: UserRole.AGENT,
        canSendManualMessages: true,
        manualMessageLimit: 10
    });

    const { cookie } = await login(email, original);

    assert.ok(cookie, "debe poder entrar con la contraseña original");

    const cambio = await fetch(`${baseUrl()}/account/password`, {
        method: "POST",
        redirect: "manual",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie
        },
        body: new URLSearchParams({
            currentPassword: original,
            password: "ClaveNuevaDePantallas123",
            confirmPassword: "ClaveNuevaDePantallas123"
        }).toString()
    });

    assert.equal(cambio.status, 302, "el cambio redirige a la confirmación");

    /**
     * Esta es la pantalla que reventaba: la confirmación del cambio, que dice
     * cuántas sesiones se cerraron.
     */
    const confirmacion = await visit(
        "/account/password?changed=1&closed=2",
        cookie
    );

    assert.equal(confirmacion.status, 200, "la confirmación se pinta");
    assert.match(
        confirmacion.body,
        /Se cerraron 2 sesión/,
        "y dice cuántas sesiones se cerraron"
    );
});

test("restablecer la contraseña desde Equipo deja la ficha en pie", async () => {
    const { cookie } = await login(fixture.adminEmail, fixture.adminPassword);

    const member = await UserService.createUser(fixture.workspaceId, {
        name: "Persona restablecida",
        email: `prueba-integracion-reset-${Date.now()}@ejemplo.mx`,
        password: "ClaveDeReset123",
        role: UserRole.AGENT,
        canSendManualMessages: true,
        manualMessageLimit: 10
    });

    const reset = await fetch(`${baseUrl()}/admin/users/${member.id}/password`, {
        method: "POST",
        redirect: "manual",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie
        },
        body: new URLSearchParams({ password: "TemporalDeReset123" }).toString()
    });

    assert.equal(reset.status, 302, "el restablecimiento redirige");

    const ficha = await visit(
        `/admin/users/${member.id}/edit?success=password`,
        cookie
    );

    assert.equal(ficha.status, 200, "la ficha del usuario se pinta");
    assert.match(
        ficha.body,
        /Contraseña restablecida/,
        "y confirma el restablecimiento"
    );
});
