import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { UserRole } from "@prisma/client";

import { prisma } from "../../src/config/prisma";
import { appConfig } from "../../src/config/app.config";
import { AuthService } from "../../src/services/auth.service";
import { UserService } from "../../src/services/user.service";
import { totpCode } from "../../src/utils/totp";
import { emailIndex } from "../../src/utils/email";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    expectRejects,
    rawPrisma,
    WorkspaceFixture
} from "./helpers";

/**
 * Verificación en dos pasos: la contraseña correcta ya no basta si la cuenta
 * la tiene activada, los códigos fallidos cuentan como intentos fallidos, el
 * secreto se guarda cifrado y un administrador puede rescatarla cuando
 * alguien pierde el teléfono.
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

/**
 * Deja la cuenta con verificación en dos pasos activada y devuelve el
 * secreto vigente. Si ya estaba activa, la apaga primero para empezar limpio.
 */
async function enableTwoFactor(userId: string): Promise<string> {
    const current = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { twoFactorSecret: true, twoFactorEnabledAt: true }
    });

    if (current.twoFactorEnabledAt && current.twoFactorSecret) {
        await UserService.disableTwoFactor(
            userId,
            totpCode(current.twoFactorSecret, Date.now())
        );
    }

    const started = await UserService.startTwoFactor(userId);

    await UserService.confirmTwoFactor(
        userId,
        totpCode(started.secret, Date.now())
    );

    return started.secret;
}

function activeSessions(userId: string) {
    return prisma.userSession.count({ where: { userId, isActive: true } });
}

test("la activación deja la cuenta verificada y el secreto cifrado", async () => {
    const secret = await enableTwoFactor(fixture.adminId);

    const state = await UserService.twoFactorState(fixture.adminId);

    assert.equal(state.enabled, true, "la cuenta debe quedar con 2FA activa");
    assert.equal(
        state.pendingSecret,
        null,
        "una vez confirmada no debe quedar secreto pendiente"
    );

    /**
     * Se mira la columna cruda con un cliente sin cifrado: lo que está
     * guardado tiene que ser el texto cifrado, nunca la clave en claro.
     */
    const rows = await rawPrisma().$queryRaw<
        Array<{ twoFactorSecret: string | null }>
    >`SELECT "twoFactorSecret" FROM "User" WHERE "id" = ${fixture.adminId}`;

    const stored = rows[0]?.twoFactorSecret ?? null;

    assert.ok(stored, "debe haber un secreto guardado");
    assert.notEqual(stored, secret, "el secreto no puede quedar en claro");
    assert.ok(
        stored!.startsWith("enc:v1:"),
        `el secreto debe estar cifrado y llegó: ${stored}`
    );
});

test("la contraseña correcta no abre sesión: primero pide el código", async () => {
    const before = await activeSessions(fixture.adminId);

    const result = await AuthService.login(
        { email: fixture.adminEmail, password: fixture.adminPassword },
        { ip: "127.0.0.1", userAgent: "Prueba/2FA" }
    );

    assert.ok(
        "twoFactorRequired" in result && result.twoFactorRequired,
        "el primer paso debe devolver el desafío, no la sesión"
    );

    assert.equal(
        await activeSessions(fixture.adminId),
        before,
        "el desafío no debe crear ninguna sesión"
    );
});

test("un código incorrecto no crea sesión y suma intentos", async () => {
    const login = await AuthService.login(
        { email: fixture.adminEmail, password: fixture.adminPassword },
        { ip: "127.0.0.1" }
    );

    assert.ok("twoFactorRequired" in login, "se esperaba el desafío");

    const challengeToken = (login as { challengeToken: string }).challengeToken;
    const before = await activeSessions(fixture.adminId);

    await expectRejects(
        () =>
            AuthService.verifyTwoFactor(
                { challengeToken, code: "000000" },
                { ip: "127.0.0.1" }
            ),
        /código no es correcto/i,
        "un código inválido debe rechazarse"
    );

    assert.equal(
        await activeSessions(fixture.adminId),
        before,
        "un código incorrecto no debe abrir sesión"
    );

    const user = await prisma.user.findUniqueOrThrow({
        where: { id: fixture.adminId },
        select: { failedLoginAttempts: true }
    });

    assert.ok(
        user.failedLoginAttempts >= 1,
        "el código fallido debe contar como intento fallido"
    );
});

test("el código correcto completa el acceso y limpia los intentos", async () => {
    const secret = await enableTwoFactor(fixture.adminId);
    const before = await activeSessions(fixture.adminId);

    const login = await AuthService.login(
        { email: fixture.adminEmail, password: fixture.adminPassword },
        { ip: "127.0.0.1" }
    );

    assert.ok("twoFactorRequired" in login, "se esperaba el desafío");

    const result = await AuthService.verifyTwoFactor(
        {
            challengeToken: (login as { challengeToken: string }).challengeToken,
            code: totpCode(secret, Date.now())
        },
        { ip: "127.0.0.1", userAgent: "Prueba/2FA" }
    );

    assert.ok(result.token, "el segundo paso debe entregar el token de sesión");
    assert.equal(
        await activeSessions(fixture.adminId),
        before + 1,
        "el código correcto debe crear exactamente una sesión"
    );

    const user = await prisma.user.findUniqueOrThrow({
        where: { id: fixture.adminId },
        select: { failedLoginAttempts: true, lockedUntil: true }
    });

    assert.equal(user.failedLoginAttempts, 0, "los intentos deben reiniciarse");
    assert.equal(user.lockedUntil, null, "no debe quedar bloqueo");
});

test("desactivarla exige un código vigente", async () => {
    const secret = await enableTwoFactor(fixture.adminId);

    await expectRejects(
        () => UserService.disableTwoFactor(fixture.adminId, "000000"),
        /código no es correcto/i,
        "sin código no se puede apagar"
    );

    assert.equal(
        (await UserService.twoFactorState(fixture.adminId)).enabled,
        true,
        "el intento fallido no debe apagarla"
    );

    await UserService.disableTwoFactor(
        fixture.adminId,
        totpCode(secret, Date.now())
    );

    assert.equal(
        (await UserService.twoFactorState(fixture.adminId)).enabled,
        false,
        "con código vigente queda apagada"
    );

    /** Y al entrar de nuevo, la contraseña sola basta. */
    const login = await AuthService.login(
        { email: fixture.adminEmail, password: fixture.adminPassword },
        { ip: "127.0.0.1" }
    );

    assert.ok(
        !("twoFactorRequired" in login),
        "sin 2FA el acceso debe resolverse en un solo paso"
    );
});

test("un administrador puede apagarla si alguien pierde el teléfono", async () => {
    const email = `prueba-integracion-2fa-${Date.now()}@ejemplo.mx`;

    const agent = await UserService.createUser(fixture.workspaceId, {
        name: "Agente con dos pasos",
        email,
        password: "ClaveDelAgente123",
        role: UserRole.AGENT,
        canSendManualMessages: true,
        manualMessageLimit: 10
    });

    await enableTwoFactor(agent.id);

    assert.equal(
        (await UserService.twoFactorState(agent.id)).enabled,
        true,
        "el agente debe quedar con 2FA activa"
    );

    await UserService.disableTwoFactorAsAdmin(
        fixture.workspaceId,
        agent.id,
        fixture.adminId
    );

    assert.equal(
        (await UserService.twoFactorState(agent.id)).enabled,
        false,
        "el rescate del administrador debe dejarla apagada"
    );

    const login = await AuthService.login(
        { email, password: "ClaveDelAgente123" },
        { ip: "127.0.0.1" }
    );

    assert.ok(
        !("twoFactorRequired" in login),
        "tras el rescate debe poder entrar con su contraseña"
    );
});

test("una activación a medias se puede descartar sin dejar la cuenta a medias", async () => {
    const email = `prueba-integracion-2fa-pendiente-${Date.now()}@ejemplo.mx`;

    const agent = await UserService.createUser(fixture.workspaceId, {
        name: "Agente a medias",
        email,
        password: "ClaveDelAgente123",
        role: UserRole.AGENT,
        canSendManualMessages: true,
        manualMessageLimit: 10
    });

    await UserService.startTwoFactor(agent.id);

    const pending = await UserService.twoFactorState(agent.id);

    assert.equal(pending.enabled, false, "generar la clave no la activa");
    assert.ok(pending.pendingSecret, "debe quedar el secreto pendiente");
    assert.ok(pending.otpauthUrl, "debe haber enlace para la app");

    /** Mientras no se confirme, la cuenta entra con contraseña. */
    const login = await AuthService.login(
        { email, password: "ClaveDelAgente123" },
        { ip: "127.0.0.1" }
    );

    assert.ok(
        !("twoFactorRequired" in login),
        "una activación sin confirmar no debe bloquear el acceso"
    );

    await UserService.cancelTwoFactor(agent.id);

    const after = await UserService.twoFactorState(agent.id);

    assert.equal(after.pendingSecret, null, "el secreto pendiente debe borrarse");
    assert.equal(after.enabled, false, "la cuenta sigue sin 2FA");
});

/**
 * Y las rutas de verdad, por HTTP: es donde se cruzan la validación, la
 * cookie, la plantilla y los redirects. El servidor lo levanta el script de
 * integración (`npm run test:integration`).
 */
function baseUrl(): string {
    return process.env.INTEGRATION_BASE_URL || "http://127.0.0.1:3987";
}

/** Cookie de sesión lista para reenviar en la siguiente petición. */
function sessionCookieFrom(response: Response): string {
    const raw = response.headers.getSetCookie().find((value) =>
        value.startsWith(`${appConfig.cookieName}=`)
    );

    assert.ok(raw, "el acceso correcto debe dejar la cookie de sesión");

    return raw.split(";")[0];
}

async function postForm(
    path: string,
    fields: Record<string, string>,
    cookie?: string
): Promise<Response> {
    return fetch(`${baseUrl()}${path}`, {
        method: "POST",
        redirect: "manual",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            ...(cookie ? { cookie } : {})
        },
        body: new URLSearchParams(fields).toString()
    });
}

test("por HTTP: la pantalla de seguridad exige sesión", async () => {
    const response = await fetch(`${baseUrl()}/account/security`, {
        redirect: "manual"
    });

    assert.equal(response.status, 302, "sin sesión debe redirigir");
    assert.match(
        response.headers.get("location") || "",
        /\/auth\/login/,
        "el redirect debe llevar al login"
    );
});

test("por HTTP: activar, fallar con un código malo y confirmar con el bueno", async () => {
    const email = `prueba-integracion-2fa-http-${Date.now()}@ejemplo.mx`;
    const password = "ClaveDeLaPrueba123";

    await UserService.createUser(fixture.workspaceId, {
        name: "Persona HTTP",
        email,
        password,
        role: UserRole.ADMIN,
        canSendManualMessages: true,
        manualMessageLimit: null
    });

    const login = await postForm("/auth/login", { email, password });

    assert.equal(login.status, 302, "sin 2FA el acceso termina en redirect");

    const cookie = sessionCookieFrom(login);

    /** 1. La pantalla arranca ofreciendo activarla. */
    const initial = await fetch(`${baseUrl()}/account/security`, {
        headers: { cookie }
    });
    const initialHtml = await initial.text();

    assert.equal(initial.status, 200, "la pantalla debe responder 200");
    assert.match(
        initialHtml,
        /Activar la verificación en dos pasos/,
        "debe ofrecer activarla"
    );

    /** 2. Al activarla se muestra la clave para la app. */
    const started = await postForm("/account/security/two-factor/start", {}, cookie);

    assert.equal(started.status, 302, "generar la clave redirige a la pantalla");

    const pending = await fetch(`${baseUrl()}/account/security`, {
        headers: { cookie }
    });
    const pendingHtml = await pending.text();

    assert.match(
        pendingHtml,
        /Clave de configuración/,
        "debe mostrar la clave para la app"
    );
    assert.match(
        pendingHtml,
        /Confirmar y activar/,
        "debe pedir el código de confirmación"
    );

    /** 3. Un código incorrecto vuelve con el motivo, sin activar nada. */
    const failed = await postForm(
        "/account/security/two-factor/confirm",
        { code: "000000" },
        cookie
    );

    assert.equal(failed.status, 302, "el intento fallido redirige con el aviso");
    assert.match(
        failed.headers.get("location") || "",
        /error=/,
        "debe explicar por qué no se activó"
    );

    /** 4. El código bueno la deja activada. */
    const me = await prisma.user.findUniqueOrThrow({
        where: { emailHash: emailIndex(email) },
        select: { id: true }
    });
    const state = await UserService.twoFactorState(me.id);

    assert.ok(state.pendingSecret, "debe haber una clave pendiente");

    const confirmed = await postForm(
        "/account/security/two-factor/confirm",
        { code: totpCode(state.pendingSecret!, Date.now()) },
        cookie
    );

    assert.equal(confirmed.status, 302, "confirmar redirige a la pantalla");
    assert.match(
        confirmed.headers.get("location") || "",
        /success=enabled/,
        "debe confirmar la activación"
    );

    const enabled = await fetch(`${baseUrl()}/account/security`, {
        headers: { cookie }
    });
    const enabledHtml = await enabled.text();

    assert.match(enabledHtml, /Activada/, "la pantalla debe mostrar el estado");
    assert.match(
        enabledHtml,
        /Desactivar/,
        "debe ofrecer desactivarla pidiendo un código"
    );

    /** 5. Con la cuenta ya protegida, la contraseña sola no da sesión. */
    const second = await postForm("/auth/login", { email, password });
    const secondHtml = await second.text();

    assert.equal(second.status, 200, "el segundo paso se pinta en el login");
    assert.match(
        secondHtml,
        /Código de verificación/,
        "debe pedir el código de la app"
    );

    const cookies = second.headers.getSetCookie();

    assert.equal(
        cookies.filter((value) => value.startsWith(`${appConfig.cookieName}=`)).length,
        0,
        "el desafío no debe dejar cookie de sesión"
    );
});
