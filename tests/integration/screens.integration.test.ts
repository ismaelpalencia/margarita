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

async function visit(path: string, cookie: string, accept?: string) {
    const response = await fetch(`${baseUrl()}${path}`, {
        headers: { ...(cookie ? { cookie } : {}), ...(accept ? { accept } : {}) },
        redirect: "manual"
    });

    const body = response.status === 200 ? await response.text() : "";

    return { status: response.status, body };
}

test("ninguna pantalla del panel responde 500", async () => {
    const { cookie } = await login(fixture.adminEmail, fixture.adminPassword);

    assert.ok(cookie, "el admin de prueba debe poder entrar");

    const panelAdmin = await visit("/panel/admin/dashboard", cookie);
    assert.equal(panelAdmin.status, 200, "el dashboard Angular del admin debe servirse");
    assert.match(panelAdmin.body, /<app-root>/, "Express debe devolver el shell Angular");
    assert.match(panelAdmin.body, /\/angular\/main-/, "el shell debe enlazar el bundle Angular");

    const member = await UserService.createUser(fixture.workspaceId, {
        name: "Persona de pantallas",
        email: `prueba-integracion-pantallas-${Date.now()}@ejemplo.mx`,
        password: "ClaveDePantallas123",
        role: UserRole.AGENT,
        canSendManualMessages: true,
        manualMessageLimit: 10,
        allowedNumberIds: []
    });

    /** Las pantallas de siempre. Si alguna truena, aquí se ve. */
    const pantallas = [
        "/",
        "/ia",
        "/onboarding",
        "/como-empezar",
        "/guia",
        "/plantillas",
        "/propuesta",
        "/aviso-de-privacidad",
        "/admin/dashboard",
        "/admin/conversations",
        "/admin/contacts",
        "/admin/contacts/new",
        `/admin/contacts/${fixture.adminId}/edit`,
        "/admin/campaigns",
        "/admin/campaigns/create",
        "/admin/quick-replies",
        "/admin/ai",
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
        "/admin/guia",
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
        manualMessageLimit: 10,
        allowedNumberIds: []
    });

    const agente = await login(email, password);

    assert.ok(agente.cookie, "el agente debe poder entrar");

    const panelAgente = await visit("/panel/agent/dashboard", agente.cookie);
    assert.equal(panelAgente.status, 200, "el dashboard Angular del agente debe servirse");
    assert.match(panelAgente.body, /<app-root>/, "el agente también recibe el shell Angular");

    const accesoAdmin = await visit("/panel/admin/dashboard", agente.cookie);
    assert.equal(accesoAdmin.status, 403, "el área admin debe seguir protegida por rol");

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

/**
 * Humo de interfaz: las pantallas clave traen su contenido, no solo un 200.
 *
 * Cubre lo que un cambio de plantilla rompe sin que nadie lo note: el aviso de
 * carga, el precio de la portada, el aviso de privacidad, la guía, el bloque de
 * trabajo del día y el tramo de mensajes.
 */
test("las pantallas clave traen su contenido", async () => {
    const { cookie } = await login(fixture.adminEmail, fixture.adminPassword);

    const casos: Array<[string, RegExp]> = [
        ["/", /Automatiza WhatsApp con IA/],
        ["/", /js\/loading\.js/],
        ["/ia", /Tu WhatsApp responde, entrega y registra/],
        ["/onboarding", /Tu operación de WhatsApp, lista en 7 días/],
        ["/aviso-de-privacidad", /7 días hábiles/],
        ["/guia", /En esta guía/],
        ["/plantillas", /Plantillas que se aprueban/],
        ["/panel/admin/reports?vista=hoy", /<app-root>/],
        ["/panel/admin/whatsapp", /<app-root>/],
        ["/panel/admin/conversations", /<app-root>/]
    ];

    for (const [path, patron] of casos) {
        const { status, body } = await visit(path, cookie);

        assert.equal(status, 200, `${path} responde 200`);
        assert.match(body, patron, `${path} trae su contenido`);
        if (path.startsWith("/panel/")) assert.match(body, /\/angular\/main-/, `${path} carga el bundle Angular`);
    }
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
        manualMessageLimit: 10,
        allowedNumberIds: []
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
    const confirmacion = await visit("/account/password?changed=1&closed=2", cookie, "application/json");

    assert.equal(confirmacion.status, 200, "la API de confirmación responde");
    assert.match(confirmacion.body, /"changed":true/, "indica que la contraseña cambió");
    assert.match(confirmacion.body, /"closed":2/, "y dice cuántas sesiones se cerraron");
});

test("restablecer la contraseña desde Equipo deja la ficha en pie", async () => {
    const { cookie } = await login(fixture.adminEmail, fixture.adminPassword);

    const member = await UserService.createUser(fixture.workspaceId, {
        name: "Persona restablecida",
        email: `prueba-integracion-reset-${Date.now()}@ejemplo.mx`,
        password: "ClaveDeReset123",
        role: UserRole.AGENT,
        canSendManualMessages: true,
        manualMessageLimit: 10,
        allowedNumberIds: []
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

    const ficha = await visit(`/admin/users/${member.id}/edit?success=password`, cookie, "application/json");

    assert.equal(ficha.status, 200, "la API de la ficha del usuario responde");
    assert.match(ficha.body, /Persona restablecida/, "la ficha corresponde a la persona actualizada");
    const resetUser = await prisma.user.findUniqueOrThrow({ where: { id: member.id }, select: { mustChangePassword: true } });
    assert.equal(resetUser.mustChangePassword, true, "el acceso siguiente debe pedir cambio de contraseña");
});
