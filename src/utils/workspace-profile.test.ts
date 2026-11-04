import assert from "node:assert/strict";
import test from "node:test";

import { WorkspaceProfile } from "@prisma/client";

import {
    isCollectionsProfile,
    isWorkspaceProfile,
    modulesForProfile,
    parseWorkspaceProfile,
    WORKSPACE_PROFILES
} from "./workspace-profile";

test("solo COBRANZA enciende el módulo de cobranza", () => {
    assert.equal(isCollectionsProfile(WorkspaceProfile.COBRANZA), true);

    for (const profile of [
        WorkspaceProfile.COMERCIO,
        WorkspaceProfile.SERVICIOS,
        WorkspaceProfile.GENERICO
    ]) {
        assert.equal(
            isCollectionsProfile(profile),
            false,
            `${profile} no debe mostrar resultados ni reportes de cobranza`
        );
    }

    assert.equal(isCollectionsProfile(null), false);
    assert.equal(isCollectionsProfile(undefined), false);
});

test("los módulos se derivan del perfil sin tocar los datos", () => {
    assert.deepEqual(modulesForProfile(WorkspaceProfile.COBRANZA), {
        collections: true
    });

    assert.deepEqual(modulesForProfile(WorkspaceProfile.COMERCIO), {
        collections: false
    });

    assert.deepEqual(modulesForProfile(WorkspaceProfile.SERVICIOS), {
        collections: false
    });

    assert.deepEqual(modulesForProfile(WorkspaceProfile.GENERICO), {
        collections: false
    });
});

test("los perfiles desconocidos no se guardan", () => {
    assert.equal(parseWorkspaceProfile("COBRANZA"), WorkspaceProfile.COBRANZA);
    assert.equal(parseWorkspaceProfile("GENERICO"), WorkspaceProfile.GENERICO);

    assert.equal(parseWorkspaceProfile("cobranza"), null);
    assert.equal(parseWorkspaceProfile("OTRO"), null);
    assert.equal(parseWorkspaceProfile(""), null);
    assert.equal(parseWorkspaceProfile(null), null);
    assert.equal(parseWorkspaceProfile(123), null);
});

test("las cuatro opciones del interruptor están declaradas", () => {
    assert.deepEqual([...WORKSPACE_PROFILES], [
        WorkspaceProfile.COBRANZA,
        WorkspaceProfile.COMERCIO,
        WorkspaceProfile.SERVICIOS,
        WorkspaceProfile.GENERICO
    ]);

    assert.equal(isWorkspaceProfile("COBRANZA"), true);
    assert.equal(isWorkspaceProfile("OTRO"), false);
});
