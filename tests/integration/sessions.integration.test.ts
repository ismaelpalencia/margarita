import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { UserRole, UserStatus } from "@prisma/client";
import bcrypt from "bcrypt";

import { prisma } from "../../src/config/prisma";
import { AuthService } from "../../src/services/auth.service";
import { SessionService } from "../../src/services/session.service";
import { UserService } from "../../src/services/user.service";
import { checkAdminRemoval, checkRoleChange } from "../../src/utils/team-rules";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    expectRejects,
    WorkspaceFixture
} from "./helpers";

/**
 * Sesiones y contraseñas: tope de dispositivos, revocación, cambio
 * obligatorio y las reglas que impiden quedarse sin administrador.
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

test("el tope de dispositivos cierra las sesiones más viejas", async () => {
    for (let index = 0; index < 4; index += 1) {
        await AuthService.login(
            { email: fixture.adminEmail, password: fixture.adminPassword },
            { ip: "127.0.0.1", userAgent: `Prueba/${index}` }
        );
    }

    const active = await prisma.userSession.count({
        where: { userId: fixture.adminId, isActive: true }
    });

    assert.equal(
        active,
        3,
        "no puede quedar más de una sesión por encima del tope configurado"
    );
});

test("cerrar las demás sesiones deja solo la actual", async () => {
    const sessions = await SessionService.listForUser(fixture.adminId);

    assert.ok(sessions.length >= 2, "debe haber varias sesiones activas");

    const keep = sessions[0].tokenId;
    const closed = await SessionService.revokeOthers(fixture.adminId, keep);

    assert.ok(closed >= 1, "debe cerrar al menos una");

    const left = await SessionService.listForUser(fixture.adminId, keep);

    assert.equal(left.length, 1, "solo queda la sesión en uso");
    assert.equal(left[0].isCurrent, true);
});

test("una sesión sin uso se considera inactiva", async () => {
    const session = await prisma.userSession.findFirstOrThrow({
        where: { userId: fixture.adminId, isActive: true }
    });

    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000);

    assert.equal(
        SessionService.isIdle({ ...session, lastSeenAt: thirteenHoursAgo }),
        true,
        "13 horas sin uso superan el límite de 12"
    );
    assert.equal(
        SessionService.isIdle({ ...session, lastSeenAt: new Date() }),
        false,
        "una sesión usada ahora no está inactiva"
    );
});

test("restablecer la contraseña cierra sesiones y obliga a cambiarla", async () => {
    const email = `agente-${Date.now()}@ejemplo.mx`;

    const agent = await UserService.createUser(fixture.workspaceId, {
        name: "Agente Prueba",
        email,
        password: "ClaveDelAgente123",
        role: UserRole.AGENT,
        canSendManualMessages: true,
        manualMessageLimit: 20
    });

    await AuthService.login(
        { email, password: "ClaveDelAgente123" },
        { ip: "127.0.0.1" }
    );

    const before = await prisma.userSession.count({
        where: { userId: agent.id, isActive: true }
    });

    assert.equal(before, 1, "el agente tiene una sesión abierta");

    await UserService.resetPassword(
        fixture.workspaceId,
        agent.id,
        "TemporalClave456",
        fixture.adminId
    );

    const after = await prisma.user.findUniqueOrThrow({
        where: { id: agent.id },
        select: { mustChangePassword: true }
    });
    const sessions = await prisma.userSession.count({
        where: { userId: agent.id, isActive: true }
    });

    assert.equal(after.mustChangePassword, true, "queda obligado a cambiarla");
    assert.equal(sessions, 0, "sus sesiones se cierran al restablecerla");

    /** Cambio propio: primero con la actual equivocada, luego bien. */
    await expectRejects(
        () =>
            UserService.changeOwnPassword({
                userId: agent.id,
                currentPassword: "NoEsLaMia123",
                newPassword: "NuevaClave7890"
            }),
        /no es correcta/i,
        "no debe cambiar la contraseña sin saber la actual"
    );

    await UserService.changeOwnPassword({
        userId: agent.id,
        currentPassword: "TemporalClave456",
        newPassword: "NuevaClave7890"
    });

    const finalUser = await prisma.user.findUniqueOrThrow({
        where: { id: agent.id },
        select: { mustChangePassword: true, password: true }
    });

    assert.equal(finalUser.mustChangePassword, false, "ya cumplió el cambio");
    assert.ok(
        await bcrypt.compare("NuevaClave7890", finalUser.password),
        "la contraseña nueva queda guardada con hash"
    );
});

test("desactivar a un usuario cierra sus sesiones", async () => {
    const email = `desactivado-${Date.now()}@ejemplo.mx`;

    const user = await UserService.createUser(fixture.workspaceId, {
        name: "Usuario a Desactivar",
        email,
        password: "ClaveDelUsuario123",
        role: UserRole.AGENT,
        canSendManualMessages: true,
        manualMessageLimit: 10
    });

    await AuthService.login({ email, password: "ClaveDelUsuario123" }, {});
    await UserService.setActive(fixture.workspaceId, user.id, false, fixture.adminId);

    const sessions = await prisma.userSession.count({
        where: { userId: user.id, isActive: true }
    });

    assert.equal(sessions, 0, "un usuario desactivado no conserva sesiones");
});

test("la instalación nunca se queda sin administrador activo", async () => {
    const admin = {
        id: fixture.adminId,
        name: "Admin de prueba",
        role: UserRole.ADMIN,
        isActive: true
    };

    /** Con un solo admin activo, quitarle el rol o desactivarlo se bloquea. */
    assert.equal(
        checkAdminRemoval({ target: admin, activeAdmins: 1 }).allowed,
        false
    );
    assert.equal(
        checkRoleChange({ target: admin, newRole: UserRole.AGENT, activeAdmins: 1 })
            .allowed,
        false
    );

    await expectRejects(
        () => UserService.setActive(fixture.workspaceId, fixture.adminId, false, fixture.adminId),
        /único administrador|administrador activo/i,
        "desactivar al último admin debe rechazarse"
    );

    await expectRejects(
        () =>
            UserService.updateUser(
                fixture.workspaceId,
                fixture.adminId,
                {
                    name: "Admin de prueba",
                    role: UserRole.AGENT,
                    canSendManualMessages: true,
                    manualMessageLimit: null
                },
                fixture.adminId
            ),
        /único administrador|administrador activo/i,
        "degradar al último admin debe rechazarse"
    );

    /** Con dos admins activos, degradar a uno sí se permite. */
    const second = await UserService.createUser(fixture.workspaceId, {
        name: "Segundo Admin",
        email: `segundo-admin-${Date.now()}@ejemplo.mx`,
        password: "ClaveDelSegundo123",
        role: UserRole.ADMIN,
        canSendManualMessages: true,
        manualMessageLimit: null
    });

    const demoted = await UserService.updateUser(
        fixture.workspaceId,
        second.id,
        {
            name: "Segundo Admin",
            role: UserRole.AGENT,
            canSendManualMessages: true,
            manualMessageLimit: 50
        },
        fixture.adminId
    );

    assert.equal(demoted.role, UserRole.AGENT);
    assert.equal(
        (
            await prisma.user.findUniqueOrThrow({
                where: { id: fixture.adminId },
                select: { role: true, isActive: true, status: true }
            })
        ).role,
        UserRole.ADMIN,
        "el admin original sigue siendo administrador"
    );
});

test("un usuario desactivado no puede entrar", async () => {
    const email = `inactivo-${Date.now()}@ejemplo.mx`;

    const user = await UserService.createUser(fixture.workspaceId, {
        name: "Usuario Inactivo",
        email,
        password: "ClaveDelInactivo123",
        role: UserRole.AGENT,
        canSendManualMessages: false,
        manualMessageLimit: null
    });

    await UserService.setActive(fixture.workspaceId, user.id, false, fixture.adminId);

    await expectRejects(
        () => AuthService.login({ email, password: "ClaveDelInactivo123" }, {}),
        /desactivado/i,
        "un usuario desactivado no debe poder iniciar sesión"
    );

    assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).status,
        UserStatus.OFFLINE
    );
});
