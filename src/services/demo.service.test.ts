import assert from "node:assert/strict";
import test from "node:test";

import { DemoService } from "./demo.service";

test.beforeEach(() => {
    DemoService._resetForTests();
});

test("crea sesión con límite de 3 por IP al día", () => {
    const first = DemoService.createSession("1.1.1.1");
    const second = DemoService.createSession("1.1.1.1");
    const third = DemoService.createSession("1.1.1.1");
    const fourth = DemoService.createSession("1.1.1.1");

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(third.ok, true);
    assert.equal(fourth.ok, false);
});

test("responde con la base de conocimiento del vertical", async () => {
    const session = DemoService.createSession("2.2.2.2");

    assert.equal(session.ok, true);

    const result = await DemoService.chat({
        sessionId: (session as { sessionId: string }).sessionId,
        message: "¿cuál es el horario?",
        vertical: "comercio"
    });

    assert.equal(result.ok, true);

    if (result.ok) {
        assert.ok(result.result.reply.length > 0, "hay respuesta");
        assert.equal(result.result.mode, "demo");
    }
});

test("limita a 30 mensajes por sesión", async () => {
    const session = DemoService.createSession("3.3.3.3");
    const sessionId = (session as { sessionId: string }).sessionId;

    for (let index = 0; index < 30; index += 1) {
        const result = await DemoService.chat({
            sessionId,
            message: "hola " + index,
            vertical: "generico"
        });

        assert.equal(result.ok, true);
    }

    const overflow = await DemoService.chat({
        sessionId,
        message: "uno más",
        vertical: "generico"
    });

    assert.equal(overflow.ok, false);

    if (!overflow.ok) {
        assert.equal(overflow.status, 429);
    }
});

test("una sesión vencida se rechaza", async () => {
    const session = DemoService.createSession("4.4.4.4");
    const sessionId = (session as { sessionId: string }).sessionId;

    DemoService._expireSessionForTests(sessionId);

    const result = await DemoService.chat({
        sessionId,
        message: "hola",
        vertical: "comercio"
    });

    assert.equal(result.ok, false);

    if (!result.ok) {
        assert.equal(result.status, 410);
    }
});