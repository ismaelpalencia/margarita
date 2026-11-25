import assert from "node:assert/strict";
import test from "node:test";
import { CallStateStore } from "./state";

const record = { callId: "call-1", agentId: "agent-1", workspaceId: "workspace-1", conversationId: "conversation-1", phase: "incoming" as const, direction: "INBOUND" as const, createdAt: 1, peer: "socket" };

test("máquina de estado permite contestar, conectar y cerrar", () => {
  const store = new CallStateStore();
  store.create(record);
  assert.equal(store.activeForAgent("agent-1")?.callId, "call-1");
  assert.equal(store.transition("call-1", "connecting").phase, "connecting");
  assert.equal(store.transition("call-1", "active").phase, "active");
  assert.equal(store.transition("call-1", "ended").phase, "ended");
  assert.throws(() => store.transition("call-1", "active"));
});

test("limpia las llamadas al desconectar el socket", () => {
  const store = new CallStateStore();
  store.create(record);
  assert.equal(store.clearPeer("socket").length, 1);
  assert.equal(store.get("call-1"), undefined);
});
