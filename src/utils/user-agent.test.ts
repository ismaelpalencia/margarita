import assert from "node:assert/strict";
import test from "node:test";

import { describeDevice } from "./user-agent";

test("reconoce los dispositivos más comunes", () => {
    assert.equal(
        describeDevice(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
        ),
        "Chrome en Windows"
    );

    assert.equal(
        describeDevice(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"
        ),
        "Safari en iPhone"
    );

    assert.equal(
        describeDevice(
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/119 Mobile Safari/537.36"
        ),
        "Chrome en Android"
    );

    assert.equal(
        describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X) Edg/120"),
        "Edge en Mac"
    );
});

test("no inventa cuando no reconoce el dispositivo", () => {
    assert.equal(describeDevice(""), "Dispositivo no identificado");
    assert.equal(describeDevice(null), "Dispositivo no identificado");
    assert.equal(
        describeDevice("algo-raro/1.0"),
        "Dispositivo no identificado"
    );
});

test("cuando solo puede decir el navegador o el sistema, lo dice", () => {
    assert.equal(describeDevice("curl/8.5.0"), "Dispositivo no identificado");
    assert.equal(describeDevice("Firefox/121"), "Firefox");
    assert.equal(describeDevice("something windows"), "Windows");
});
