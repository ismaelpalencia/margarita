import assert from "node:assert/strict";
import test from "node:test";

import { isMountPoint } from "./storage-status.service";

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
    assert.equal(isMountPoint("/app/uploads/media/otra", MOUNT_INFO), false);
    assert.equal(isMountPoint("/app", MOUNT_INFO), false);
});

test("sin información de montajes no se inventa persistencia", () => {
    assert.equal(isMountPoint("/data", ""), false);
});
