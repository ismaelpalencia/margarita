import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
    buildMediaRelativePath,
    extensionFromMime,
    resolveMediaPath,
    sanitizeFilename
} from "./media-storage.service";

test("deriva la extensión desde el tipo MIME", () => {
    assert.equal(extensionFromMime("image/jpeg"), ".jpg");
    assert.equal(extensionFromMime("IMAGE/PNG"), ".png");
    assert.equal(extensionFromMime("audio/ogg; codecs=opus"), ".ogg");
    assert.equal(extensionFromMime("application/pdf"), ".pdf");
    assert.equal(extensionFromMime(null), "");
    assert.equal(extensionFromMime("application/x-rar"), "");
});

test("limpia el nombre del archivo", () => {
    assert.equal(sanitizeFilename("../../etc/passwd"), "passwd");
    assert.equal(sanitizeFilename("C:\\temp\\factura.pdf"), "factura.pdf");
    assert.equal(sanitizeFilename("   "), "archivo");
    assert.equal(sanitizeFilename(null), "archivo");
    assert.equal(sanitizeFilename("..").length > 0, true);
    assert.equal(sanitizeFilename("x".repeat(300)).length, 120);
});

test("construye una ruta relativa por workspace y mensaje", () => {
    assert.equal(
        buildMediaRelativePath({
            workspaceId: "cm123",
            messageId: "cm456",
            extension: ".jpg"
        }),
        "cm123/cm456.jpg"
    );
});

test("rechaza identificadores con intento de traversal", () => {
    assert.throws(() =>
        buildMediaRelativePath({
            workspaceId: "../..",
            messageId: "cm456",
            extension: ".jpg"
        })
    );

    assert.throws(() =>
        buildMediaRelativePath({
            workspaceId: "cm123",
            messageId: "cm456/../../otro",
            extension: ".jpg"
        })
    );
});

test("ignora una extensión que no es segura", () => {
    assert.equal(
        buildMediaRelativePath({
            workspaceId: "cm123",
            messageId: "cm456",
            extension: "../../etc/passwd"
        }),
        "cm123/cm456"
    );
});

test("resuelve la ruta dentro de la carpeta base", () => {
    const base = path.join("/tmp", "medios");

    assert.equal(
        resolveMediaPath("cm123/cm456.jpg", base),
        path.join(base, "cm123", "cm456.jpg")
    );
});

test("no permite salir de la carpeta base", () => {
    const base = path.join("/tmp", "medios");

    assert.throws(() => resolveMediaPath("../secreto.txt", base));
    assert.throws(() => resolveMediaPath("cm123/../../secreto.txt", base));
});
