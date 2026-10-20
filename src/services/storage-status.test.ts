import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ensureMediaDirectory, isMountPoint } from "./storage-status.service";

/**
 * Líneas reales de `/proc/self/mountinfo` (recortadas): el punto de montaje es
 * el quinto campo.
 */
const MOUNT_INFO = [
    "22 1 0:21 / / rw,relatime shared:1 - overlay overlay rw",
    "36 22 8:1 / /data rw,relatime shared:2 - ext4 /dev/sda1 rw",
    "40 22 0:5 / /app/uploads/media rw,relatime shared:3 - ext4 /dev/sdb1 rw"
].join("\n");

test("reconoce el directorio montado como Volume", () => {
    assert.equal(isMountPoint("/data", MOUNT_INFO), true);
    assert.equal(isMountPoint("/data/", MOUNT_INFO), true);
    assert.equal(isMountPoint("/app/uploads/media", MOUNT_INFO), true);
});

test("un directorio dentro del contenedor no es Volume", () => {
    /** Colgado de un montaje sí es persistente; colgado de `/` no. */
    assert.equal(isMountPoint("/app/uploads/media/otra", MOUNT_INFO), true);
    assert.equal(isMountPoint("/app", MOUNT_INFO), false);
});

test("sin información de montajes no se inventa persistencia", () => {
    assert.equal(isMountPoint("/data", ""), false);
});

test("crea la subcarpeta de medios cuando el punto de montaje ya existe", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "margarita-media-"));
    const media = path.join(base, "media");

    try {
        const status = ensureMediaDirectory(media);

        assert.equal(status.exists, true);
        assert.equal(status.writable, true);
        assert.equal(fs.existsSync(media), true);
    } finally {
        fs.rmSync(base, { recursive: true, force: true });
    }
});
