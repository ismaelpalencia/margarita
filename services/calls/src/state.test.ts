import assert from "node:assert/strict";
import test from "node:test";
import { chooseIncomingRecipient, CallStateStore, finalCallStatus } from "./state";

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

test("busca una llamada saliente por el identificador entregado por Meta", () => {
  const store = new CallStateStore();
  store.create({ ...record, metaCallId: "meta-call-1", direction: "OUTBOUND" });
  assert.equal(store.findByMetaCallId("meta-call-1")?.callId, "call-1");
});

test("clasifica como completada una llamada activa antes de cambiarla a ended", () => {
  assert.equal(finalCallStatus("active"), "COMPLETED");
  assert.equal(finalCallStatus("terminating"), "COMPLETED");
  assert.equal(finalCallStatus("connecting"), "MISSED");
});

test("conserva una llamada activa mientras Meta confirma el colgado", () => {
  const store = new CallStateStore();
  store.create({ ...record, phase: "active" });
  store.transition("call-1", "terminating");
  assert.equal(store.activeForAgent("agent-1")?.phase, "terminating");
  assert.equal(store.transition("call-1", "ended").phase, "ended");
});

test("entrega entrantes al administrador si no hay agente asignado conectado", () => {
  const recipient = chooseIncomingRecipient([
    { userId: "admin-1", role: "ADMIN", workspaceId: "workspace-1", conversationId: "conversation-1", ready: true, assignedAgentCanCall: false, hasActiveCall: false },
    { userId: "agent-1", role: "AGENT", workspaceId: "workspace-1", conversationId: "conversation-1", ready: false, assignedAgentCanCall: true, hasActiveCall: false }
  ], { workspaceId: "workspace-1", conversationId: "conversation-1", assignedAgentId: "agent-1" });
  assert.equal(recipient?.userId, "admin-1");
});

test("prefiere agente asignado disponible y no interrumpe quien ya está en llamada", () => {
  const candidates = [
    { userId: "admin-1", role: "ADMIN", workspaceId: "workspace-1", conversationId: "conversation-1", ready: true, assignedAgentCanCall: false, hasActiveCall: false },
    { userId: "agent-1", role: "AGENT", workspaceId: "workspace-1", conversationId: "conversation-1", ready: true, assignedAgentCanCall: true, hasActiveCall: false }
  ];
  assert.equal(chooseIncomingRecipient(candidates, { workspaceId: "workspace-1", conversationId: "conversation-1", assignedAgentId: "agent-1" })?.userId, "agent-1");
  candidates[1].hasActiveCall = true;
  assert.equal(chooseIncomingRecipient(candidates, { workspaceId: "workspace-1", conversationId: "conversation-1", assignedAgentId: "agent-1" })?.userId, "admin-1");
});
