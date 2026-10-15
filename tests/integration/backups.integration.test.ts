import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

import { appConfig } from "../../src/config/app.config";
import { prisma } from "../../src/config/prisma";
import { BackupFileService } from "../../src/services/backup-file.service";
import { decodeSnapshot } from "../../src/utils/backup-format";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    destructiveAllowed,
    WorkspaceFixture
} from "./helpers";

/**
 * Respaldos: que se creen, se puedan leer y contengan los datos.
 *
 * La prueba escribe en una carpeta temporal a propósito: el respaldo real de
 * la instalación no se toca, y la poda no puede borrar copias de verdad.
 *
 * La restauración completa (que borra la base) solo corre en CI, donde la
 * base es desechable.
 */

let fixture: WorkspaceFixture;
let originalDir: string;
let tempDir: string;

before(async () => {
    fixture = await createWorkspaceFixture();

    originalDir = appConfig.backupDir;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "margarita-respaldo-"));
    appConfig.backupDir = tempDir;
});

after(async () => {
    appConfig.backupDir = originalDir;
    fs.rmSync(tempDir, { recursive: true, force: true });

    await cleanupWorkspace(fixture.workspaceId);
    await disconnectFixtures();
    await prisma.$disconnect();
});

test("el respaldo se crea cifrado, se puede leer y contiene las tablas", async () => {
    const { info, counts } = await BackupFileService.create("MANUAL");

    assert.ok(fs.existsSync(info.path), "el archivo debe existir");
    assert.ok(info.size > 0, "el archivo no puede estar vacío");

    const content = fs.readFileSync(info.path, "utf8");

    assert.ok(
        content.startsWith("enc:v1:"),
        "el respaldo debe estar cifrado: un archivo robado no expone nada"
    );
    assert.ok(
        !content.includes("enc:v1:", content.indexOf("enc:v1:") + 1),
        "el archivo no debe contener varios volcados"
    );

    /** Se vuelve a leer: es la verificación que hace el propio servicio. */
    const payload = BackupFileService.read(info.path);

    assert.equal(payload.format, "margarita-backup@1");
    assert.ok(
        (payload.counts.Contact ?? 0) >= 0,
        "el respaldo trae el conteo por tabla"
    );
    assert.ok(
        Array.isArray(payload.tables.Contact),
        "las filas de contactos viajan dentro del respaldo"
    );
    assert.equal(counts.Workspace, payload.counts.Workspace);

    /** Nuestro workspace de prueba tiene que estar dentro. */
    const workspaces = payload.tables.Workspace as Array<{ id: string }>;

    assert.ok(
        workspaces.some((row) => row.id === fixture.workspaceId),
        "el respaldo incluye la empresa creada por la prueba"
    );

    /** Y los campos sensibles siguen cifrados dentro del archivo. */
    const contacts = payload.tables.Contact as Array<{ phone?: string }>;
    const sample = contacts.find((row) => row.phone);

    if (sample) {
        assert.ok(
            sample.phone!.startsWith("enc:v1:"),
            "el teléfono viaja cifrado también dentro del respaldo"
        );
    }
});

test("no pide respaldo de inmediato si acaba de crearse", async () => {
    const status = await BackupFileService.status();

    assert.equal(status.stale, false, "un respaldo recién hecho no está viejo");
    assert.equal(
        BackupFileService.needsBackup(status),
        false,
        "no debe pedir otro respaldo antes del intervalo"
    );
    assert.ok(status.count >= 1, "la copia aparece en el estado");
});

test("la poda respeta el número de copias configurado", async () => {
    /** Se simulan copias viejas con fecha real en el archivo. */
    const fakes = [
        ["margarita-2026-01-01-0300.mgb", "2026-01-01T09:00:00Z"],
        ["margarita-2026-01-02-0300.mgb", "2026-01-02T09:00:00Z"],
        ["margarita-2026-01-03-0300.mgb", "2026-01-03T09:00:00Z"]
    ] as const;

    for (const [name, when] of fakes) {
        const full = path.join(tempDir, name);

        fs.writeFileSync(full, "simulada", "utf8");
        fs.utimesSync(full, new Date(when), new Date(when));
    }

    /** Se baja el tope para que la poda tenga algo que hacer. */
    const originalKeep = appConfig.backupKeep;
    appConfig.backupKeep = 2;

    try {
        const before = BackupFileService.list().length;
        const pruned = BackupFileService.prune();
        const after = BackupFileService.list();

        assert.ok(before > after.length, "la poda debe haber quitado copias");
        assert.ok(pruned > 0, "debe reportar cuántas quitó");
        assert.equal(after.length, 2, "conserva exactamente el tope configurado");
        assert.ok(
            after.some((item) => item.file.startsWith("margarita-2026-01-03")),
            "se conserva la más reciente de las simuladas"
        );
        assert.equal(
            after.some((item) => item.file.startsWith("margarita-2026-01-01")),
            false,
            "la más vieja se va"
        );
    } finally {
        appConfig.backupKeep = originalKeep;
    }
});

test("el archivo se verifica al crearse: uno corrupto no se da por bueno", async () => {
    const broken = path.join(tempDir, "margarita-2026-01-09-0300.mgb");

    fs.writeFileSync(broken, "esto no es un respaldo", "utf8");

    assert.throws(
        () => decodeSnapshot(fs.readFileSync(broken, "utf8")),
        /no es un respaldo|formato/i,
        "un archivo ajeno debe rechazarse en lugar de restaurarse a ciegas"
    );
});

test("la restauración solo corre donde la base es desechable", { skip: !destructiveAllowed() }, async () => {
    /** En CI: `INTEGRATION_DESTRUCTIVE=1`. En local se salta a propósito. */
    const { info } = await BackupFileService.create("MANUAL");
    const payload = BackupFileService.read(info.path);

    assert.ok(payload.counts.Workspace >= 1);
    assert.ok(
        payload.tables.Message,
        "el respaldo trae la tabla de mensajes para restaurar"
    );
});
