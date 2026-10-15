import assert from "node:assert/strict";
import test from "node:test";

import { UserRole } from "@prisma/client";

import {
    checkAdminRemoval,
    checkRoleChange,
    generatePassword
} from "./team-rules";

const admin = (over: Partial<{ id: string; name: string; role: UserRole; isActive: boolean }> = {}) => ({
    id: "u1",
    name: "Ismael",
    role: UserRole.ADMIN,
    isActive: true,
    ...over
});

test("quitar el rol a un agente siempre se permite", () => {
    const result = checkAdminRemoval({
        target: admin({ role: UserRole.AGENT, name: "Ana" }),
        activeAdmins: 1
    });

    assert.equal(result.allowed, true);
});

test("con dos administradores activos se puede quitar el rol", () => {
    const result = checkAdminRemoval({
        target: admin({ name: "Ismael" }),
        activeAdmins: 2
    });

    assert.equal(result.allowed, true);
});

test("no se puede dejar la instalación sin administradores activos", () => {
    const result = checkAdminRemoval({
        target: admin({ name: "Ismael" }),
        activeAdmins: 1
    });

    assert.equal(result.allowed, false);
    assert.match(result.reason ?? "", /Ismael/);
    assert.match(result.reason ?? "", /único administrador/i);
});

test("un administrador ya desactivado no cuenta ni bloquea", () => {
    const result = checkAdminRemoval({
        target: admin({ isActive: false }),
        activeAdmins: 1
    });

    assert.equal(result.allowed, true);
});

test("dar acceso de administrador nunca se bloquea", () => {
    assert.equal(
        checkRoleChange({
            target: admin({ role: UserRole.AGENT }),
            newRole: UserRole.ADMIN,
            activeAdmins: 1
        }).allowed,
        true
    );
});

test("degradar al último administrador activo se bloquea", () => {
    const result = checkRoleChange({
        target: admin(),
        newRole: UserRole.AGENT,
        activeAdmins: 1
    });

    assert.equal(result.allowed, false);
});

test("la contraseña generada cumple la política", () => {
    const password = generatePassword((index) => index * 7 + 3);

    assert.equal(password.length, 14);
    assert.match(password, /[A-Za-z]/);
    assert.match(password, /\d/);
    assert.match(password, /^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
});

test("aunque el azar no dé números, la contraseña los incluye", () => {
    /** Bytes que caen siempre en la parte de letras del alfabeto. */
    const password = generatePassword(() => 1);

    assert.match(password, /\d/);
});

test("la misma semilla produce la misma contraseña", () => {
    const first = generatePassword((index) => index);
    const second = generatePassword((index) => index);

    assert.equal(first, second);
});
