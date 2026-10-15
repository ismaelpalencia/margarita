import assert from "node:assert/strict";
import test from "node:test";

import {
    BACKUP_FORMAT,
    SnapshotPayload,
    decodeSnapshot,
    encodeSnapshot,
    humanSize,
    snapshotFilename
} from "./backup-format";
import { encryptSecret } from "./crypto";

const TEST_KEY = "clave-de-prueba-para-respaldos-1234567890";

function payload(): SnapshotPayload {
    return {
        format: BACKUP_FORMAT,
        createdAt: "2026-10-15T09:00:00.000Z",
        app: "Margarita",
        counts: { Contact: 2 },
        tables: {
            Contact: [
                { id: "c1", phone: "enc:v1:a:b:c", outcomeAmount: "enc:v1:a:b:c" },
                { id: "c2", phone: "enc:v1:d:e:f" }
            ]
        }
    };
}

test("un respaldo se guarda cifrado y se puede volver a leer", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const encoded = encodeSnapshot(payload());

    assert.ok(encoded.startsWith("enc:v1:"), "el archivo debe quedar cifrado");
    assert.equal(
        encoded.includes("5215500000001"),
        false,
        "no debe exponer datos"
    );

    const decoded = decodeSnapshot(encoded);

    assert.equal(decoded.format, BACKUP_FORMAT);
    assert.equal(decoded.counts.Contact, 2);
    assert.equal(decoded.tables.Contact.length, 2);
});

test("un respaldo con otra llave no se puede leer", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
    const encoded = encodeSnapshot(payload());

    process.env.ENCRYPTION_KEY = "otra-clave-distinta-para-probar-1234567890";

    assert.throws(() => decodeSnapshot(encoded));
});

test("rechaza archivos que no son respaldos", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    assert.throws(() => decodeSnapshot(""), /vacío/i);
    assert.throws(() => decodeSnapshot("cualquier cosa"), /no es un respaldo|no se pudo leer/i);
    assert.throws(
        () => decodeSnapshot(JSON.stringify({ hola: "mundo" })),
        /formato/i
    );
});

test("acepta un respaldo en claro con el mismo sobre", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    const decoded = decodeSnapshot(JSON.stringify(payload()));

    assert.equal(decoded.counts.Contact, 2);
});

test("el nombre del archivo ordena bien y no lleva dos puntos", () => {
    const name = snapshotFilename(
        new Date("2026-10-15T09:05:00.000Z"),
        "America/Mexico_City"
    );

    assert.match(name, /^margarita-\d{4}-\d{2}-\d{2}-\d{4}\.mgb$/);
    assert.equal(name.includes(":"), false);
});

test("el tamaño se muestra en unidades legibles", () => {
    assert.equal(humanSize(800), "800 B");
    assert.equal(humanSize(2048), "2.0 KB");
    assert.equal(humanSize(3 * 1024 * 1024), "3.0 MB");
});

test("un archivo cifrado pero corrupto avisa que no se pudo descomprimir", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;

    /** Cifrado válido, pero el contenido no es un gzip. */
    const roto = encryptSecret("esto-no-es-un-gzip");

    assert.throws(() => decodeSnapshot(roto), /descomprimir/i);
});
