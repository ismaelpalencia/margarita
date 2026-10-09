import assert from "node:assert/strict";
import test from "node:test";

import {
    getConversationWindowExpiresAt,
    isConversationWindowOpen
} from "./conversation-window";

test("la ventana está cerrada si el cliente nunca escribió", () => {
    assert.equal(isConversationWindowOpen(null), false);
});

test("la ventana está abierta justo después de un mensaje del cliente", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    assert.equal(isConversationWindowOpen(oneHourAgo), true);
});

test("la ventana sigue abierta a las 23 horas", () => {
    const almostADay = new Date(Date.now() - 23 * 60 * 60 * 1000);

    assert.equal(isConversationWindowOpen(almostADay), true);
});

test("la ventana está cerrada pasadas las 24 horas", () => {
    const dayAndABit = new Date(Date.now() - 25 * 60 * 60 * 1000);

    assert.equal(isConversationWindowOpen(dayAndABit), false);
});

test("el vencimiento se calcula exactamente 24 horas después", () => {
    const incomingAt = new Date("2026-03-10T12:00:00.000Z");
    const expiresAt = getConversationWindowExpiresAt(incomingAt);

    assert.ok(expiresAt);
    assert.equal(
        expiresAt!.getTime() - incomingAt.getTime(),
        24 * 60 * 60 * 1000
    );
});

test("sin mensaje entrante no hay vencimiento", () => {
    assert.equal(getConversationWindowExpiresAt(null), null);
});
