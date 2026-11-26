import crypto from "node:crypto";
import { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { CallClaims, verifyCallToken } from "./auth";
import { MetaCallAction, MetaCallApiError, ParsedCall, parseCallWebhooks, sendMetaCallAction } from "./meta-calls";
import { chooseIncomingRecipient, CallStateStore, finalCallStatus, safeCallEventPayload } from "./state";
import type { CallRecord } from "./state";
import { getTurnCredentials } from "./turn";

type CallContext = {
  workspaceId: string;
  conversationId: string;
  contactId: string;
  phone: string;
  agentId: string;
  phoneNumberId: string;
  apiVersion: string;
  metaAccessToken: string;
  canCall: boolean;
  assignedAgentCanCall?: boolean;
  eligibleRecipientIds?: string[];
  direction?: string;
  callId?: string;
};
type ClientMessage = { event?: string; callId?: string; conversationId?: string; sdp?: string; enabled?: boolean; visible?: boolean };

const state = new CallStateStore();
const agentSockets = new Map<string, WebSocket>();
const socketClaims = new WeakMap<WebSocket, CallClaims>();
const socketVisible = new WeakMap<WebSocket, boolean>();
const socketTasks = new WeakMap<WebSocket, Promise<void>>();
const rate = new Map<string, { at: number; count: number }>();
const webhookTasks = new Map<string, Promise<void>>();
let lastRatePruneAt = 0;

function send(socket: WebSocket, event: string, data: Record<string, unknown> = {}): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event, ...data }));
}

function reportClientActionError(socket: WebSocket, error: unknown, clientEvent: string): void {
  if (error instanceof MetaCallApiError) {
    console.warn("Meta rechazó una acción de llamada.", { clientEvent, action: error.action, httpStatus: error.httpStatus, code: error.metaCode, subcode: error.metaSubcode });
    send(socket, "call:error", { clientEvent, message: error.message });
    return;
  }
  console.warn("Falló una acción de señalización.", { clientEvent, errorName: error instanceof Error ? error.name : "UnknownError" });
  send(socket, "call:error", { clientEvent, message: "No se pudo completar la acción de llamada." });
}

function safeOrigin(origin: string | undefined): boolean {
  if (!origin) return process.env.NODE_ENV !== "production";
  try { return new URL(origin).origin === new URL(process.env.MARGARITA_INTERNAL_URL || "").origin; } catch { return false; }
}

async function callInternal<T>(path: string, body: unknown): Promise<T> {
  const base = process.env.MARGARITA_INTERNAL_URL;
  const secret = process.env.CALLS_INTERNAL_SECRET;
  if (!base || !secret) throw new Error("No está configurado el enlace interno con Margarita.");
  const response = await fetch(new URL(path, base), {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Margarita respondió ${response.status} en el enlace interno.`);
  return await response.json() as T;
}

async function notifyMargarita(event: Record<string, unknown>): Promise<void> {
  await callInternal("/internal/calls/events", safeCallEventPayload(event));
}

function lifecycleEvent(call: CallRecord, status: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workspaceId: call.workspaceId,
    conversationId: call.conversationId,
    agentId: call.agentId || undefined,
    metaCallId: call.metaCallId || call.callId,
    localCallId: call.callId,
    direction: call.direction,
    recipientUserIds: call.recipientUserIds,
    status,
    ...extra
  };
}

async function contextForClaims(claims: CallClaims): Promise<CallContext> {
  if (!claims.conversationId) throw new Error("El token no está ligado a una conversación.");
  return contextForConversation(claims, claims.conversationId);
}

async function contextForConversation(claims: CallClaims, conversationId: string): Promise<CallContext> {
  const result = await callInternal<{ context: CallContext }>("/internal/calls/context", {
    purpose: "conversation", userId: claims.userId, workspaceId: claims.workspaceId,
    conversationId, role: claims.role
  });
  if (!result.context?.canCall || result.context.agentId !== claims.userId) throw new Error("La conversación ya no está disponible para llamadas.");
  return result.context;
}

async function validatePresence(claims: CallClaims): Promise<void> {
  const result = await callInternal<{ context: { canReceiveCalls: boolean } }>("/internal/calls/context", {
    purpose: "presence", userId: claims.userId, workspaceId: claims.workspaceId, role: claims.role
  });
  if (!result.context?.canReceiveCalls) throw new Error("La cuenta ya no puede recibir llamadas.");
}

function wsToken(req: IncomingMessage): string | null {
  const url = new URL(req.url || "/", "http://localhost");
  return url.searchParams.get("token");
}

function hitRateLimit(ip: string): boolean {
  const now = Date.now();
  if (now - lastRatePruneAt >= 60_000) {
    for (const [key, value] of rate) if (now - value.at >= 60_000) rate.delete(key);
    lastRatePruneAt = now;
  }
  const current = rate.get(ip);
  if (!current || now - current.at >= 60_000) {
    if (!current && rate.size >= 10_000) return false;
    rate.set(ip, { at: now, count: 1 });
    return true;
  }
  current.count++;
  return current.count <= 30;
}

function sendCallEvent(call: ParsedCall): void {
  const previous = webhookTasks.get(call.id) || Promise.resolve();
  const task = previous.then(async () => {
    if (call.event === "connect" && call.direction === "USER_INITIATED" && state.get(call.id)) {
      console.info("Webhook entrante duplicado ignorado.", { callIdSuffix: call.id.slice(-6) });
      return;
    }
    await handleMetaCall(call);
  }).catch((error: unknown) => console.warn("No se pudo gestionar un evento entrante de llamadas.", { event: call.event, status: call.status || "unknown", errorName: error instanceof Error ? error.name : "UnknownError" }));
  webhookTasks.set(call.id, task);
  void task.finally(() => { if (webhookTasks.get(call.id) === task) webhookTasks.delete(call.id); });
}

function scheduleIncomingTimeout(callId: string): void {
  const timeout = setTimeout(() => {
    const call = state.get(callId);
    if (!call || call.direction !== "INBOUND" || call.phase !== "incoming") return;
    const context = call.context as CallContext;
    state.transition(call.callId, "terminating");
    void performAction(context, "reject", call.metaCallId || call.callId).catch(() => undefined).finally(async () => {
      if (state.get(call.callId)?.phase !== "terminating") return;
      try { state.transition(call.callId, "rejected"); } catch { /* Meta pudo finalizarla primero */ }
      await notifyMargarita(lifecycleEvent(call, "MISSED", { error: "No hubo respuesta en el panel." })).catch(() => undefined);
      state.remove(call.callId);
    });
  }, 25_000);
  timeout.unref();
}

function deliverIncoming(call: CallRecord, socket: WebSocket, notifyClaim = false): boolean {
  const claims = socketClaims.get(socket);
  if (!claims) return false;
  if (call.peer === socket && claims.userId !== call.agentId) return false;
  const claimed = call.peer === socket ? call : state.claimIncoming(call.callId, claims.userId, socket);
  if (!claimed) return false;
  const context = claimed.context as CallContext;
  send(socket, "call:incoming", { callId: claimed.callId, conversationId: claimed.conversationId, phone: context.phone, sdp: claimed.incomingSdp });
  if (notifyClaim) void notifyMargarita(lifecycleEvent(claimed, "RINGING", { recipientUserIds: claimed.recipientUserIds || [], pushUserIds: [], closePushUserIds: claimed.notifiedUserIds || [] })).catch(() => undefined);
  return true;
}

function dispatchPendingIncoming(userId: string, socket: WebSocket): void {
  for (const call of state.pendingIncomingForUser(userId)) {
    const active = state.activeForAgent(userId);
    if (active && active.callId !== call.callId) return;
    if (deliverIncoming(call, socket, true)) return;
  }
}

async function handleMetaCall(incoming: ParsedCall): Promise<void> {
  if (incoming.event === "connect" && incoming.direction === "USER_INITIATED") {
    const result = await callInternal<{ context?: CallContext & { eligibleRecipientIds?: string[] } }>("/internal/calls/context", {
      purpose: "incoming", phoneNumberId: incoming.phoneNumberId, phone: incoming.from, callId: incoming.id
    });
    const context = result.context;
    const recipientIds = context?.eligibleRecipientIds || [];
    const candidates = [...agentSockets.entries()].map(([userId, candidate]) => {
      const claims = socketClaims.get(candidate);
      return { userId, socket: candidate, claims, role: claims?.role || "", workspaceId: claims?.workspaceId || "", conversationId: context?.conversationId || "", ready: candidate.readyState === WebSocket.OPEN, assignedAgentCanCall: userId === context?.agentId && Boolean(context?.assignedAgentCanCall) && recipientIds.includes(userId), adminCanCall: claims?.role === "ADMIN" && recipientIds.includes(userId), hasActiveCall: Boolean(state.activeForAgent(userId)) };
    });
    const selectedCandidate = context ? chooseIncomingRecipient(candidates, { workspaceId: context.workspaceId, conversationId: context.conversationId, assignedAgentId: context.agentId }) : undefined;
    const selected = selectedCandidate && candidates.find((candidate) => candidate.userId === selectedCandidate.userId);
    if (!context?.canCall || !recipientIds.length || !incoming.sdp) {
      const reason = !context?.canCall || !recipientIds.length ? "conversation_not_eligible" : "offer_missing";
      console.info("Llamada entrante rechazada por disponibilidad.", { event: incoming.event, reason });
      if (context?.phoneNumberId && context.metaAccessToken) {
        await sendMetaCallAction({ apiVersion: context.apiVersion, phoneNumberId: context.phoneNumberId, accessToken: context.metaAccessToken, action: "reject", callId: incoming.id });
      }
      if (context?.conversationId) await notifyMargarita({ workspaceId: context.workspaceId, conversationId: context.conversationId, agentId: context.agentId || undefined, metaCallId: incoming.id, localCallId: incoming.id, direction: "INBOUND", status: "MISSED", error: "No había un usuario autorizado para recibir la llamada." });
      return;
    }
    const primaryRecipient = selected?.userId || recipientIds[0];
    const pushUserIds = selected
      ? (socketVisible.get(selected.socket) === false ? [selected.userId] : [])
      : recipientIds;
    const callContext = { ...context, agentId: primaryRecipient };
    const call: CallRecord = { callId: incoming.id, agentId: primaryRecipient, workspaceId: context.workspaceId, conversationId: context.conversationId, phase: "incoming", direction: "INBOUND", createdAt: Date.now(), peer: selected?.socket, context: callContext, incomingSdp: incoming.sdp, recipientUserIds: recipientIds, notifiedUserIds: pushUserIds };
    state.create(call);
    if (selected) {
      deliverIncoming(call, selected.socket);
      console.info("Llamada entrante entregada al panel.", { recipientRole: selected.claims?.role, callIdSuffix: call.callId.slice(-6) });
    } else {
      console.info("Llamada entrante en espera de que un agente o administrador abra el panel.", { callIdSuffix: call.callId.slice(-6) });
    }
    await notifyMargarita(lifecycleEvent(call, "RINGING", { recipientUserIds: recipientIds, pushUserIds }));
    scheduleIncomingTimeout(call.callId);
    return;
  }

  const current = state.get(incoming.id)
    || (incoming.callbackData ? state.get(incoming.callbackData) : undefined)
    || state.findByMetaCallId(incoming.id);
  if (!current) return;
  if (current.direction === "OUTBOUND" && incoming.id !== current.callId) current.metaCallId = incoming.id;
  const context = current.context as CallContext;
  const socket = current.peer as WebSocket;
  if (incoming.event === "rejected" || incoming.status === "REJECTED") {
    const rejectionStatus = current.direction === "INBOUND" && current.phase === "terminating" ? "MISSED" : "REJECTED";
    try { state.transition(current.callId, "rejected"); } catch { /* estado terminal */ }
    if (socket) send(socket, "call:rejected", { callId: current.callId, message: incoming.error || "El contacto rechazó la llamada." });
    await notifyMargarita(lifecycleEvent(current, rejectionStatus, { error: incoming.error }));
    state.remove(current.callId);
    return;
  }
  if (current.cancelRequested && current.direction === "OUTBOUND" && current.metaCallId && incoming.event !== "terminate" && incoming.status !== "COMPLETED") {
    try {
      await performAction(context, "terminate", current.metaCallId);
      current.terminationWasActive = false;
      if (current.phase !== "terminating" && current.phase !== "ended") state.transition(current.callId, "terminating");
      const timeout = setTimeout(() => {
        const pending = state.get(current.callId);
        if (!pending || pending.phase !== "terminating") return;
        state.remove(current.callId);
        void notifyMargarita(lifecycleEvent(current, "FAILED", { error: "Meta no confirmó la cancelación de la llamada saliente." })).catch(() => undefined);
      }, 30_000);
      timeout.unref();
      console.info("Llamada saliente cancelada al recibir el identificador de Meta.", { callIdSuffix: current.callId.slice(-6) });
    } catch {
      if (socket) send(socket, "call:error", { callId: current.callId, clientEvent: "call:hangup", message: "No se pudo terminar la llamada saliente." });
      console.warn("Meta rechazó la cancelación pendiente de una llamada saliente.", { action: "terminate", callIdSuffix: current.callId.slice(-6) });
    }
    return;
  }
  if (incoming.event === "terminate" || incoming.status === "COMPLETED") {
    const finalStatus = incoming.error ? "FAILED" : finalCallStatus(current.phase, current.terminationWasActive);
    try { state.transition(current.callId, "ended"); } catch { /* estado terminal */ }
    if (socket && incoming.error) send(socket, "call:error", { callId: current.callId, message: incoming.error });
    else if (socket) send(socket, "call:ended", { callId: current.callId, durationSeconds: incoming.duration ?? null });
    await notifyMargarita(lifecycleEvent(current, finalStatus, { durationSeconds: incoming.duration, error: incoming.error }));
    console.info("Llamada finalizada por evento Meta.", { direction: current.direction, status: finalStatus, callIdSuffix: current.callId.slice(-6) });
    state.remove(current.callId);
    return;
  }
  if (["accepted", "ringing"].includes(incoming.event) || ["ACCEPTED", "RINGING"].includes(incoming.status || "")) {
    if (socket) send(socket, incoming.status === "ACCEPTED" || incoming.event === "accepted" ? "call:accepted" : "call:connecting", { callId: current.callId });
  }
  if (incoming.sdp && current.direction === "OUTBOUND" && socket) {
    current.metaCallId = incoming.id;
    send(socket, "call:answer", { callId: current.callId, sdp: incoming.sdp });
  }
}

async function performAction(context: CallContext, action: MetaCallAction, callId?: string, sdp?: string): Promise<void> {
  await sendMetaCallAction({ apiVersion: context.apiVersion, phoneNumberId: context.phoneNumberId, accessToken: context.metaAccessToken, to: context.phone, action, callId, sdp });
}

async function handleClientMessage(socket: WebSocket, message: ClientMessage): Promise<void> {
  const claims = socketClaims.get(socket);
  if (!claims || typeof message.event !== "string") return;

  if (message.event === "call:visibility") {
    socketVisible.set(socket, message.visible === true);
    return;
  }

  if (message.event === "call:start") {
    const conversationId = typeof message.conversationId === "string" ? message.conversationId : "";
    if (!conversationId || (claims.conversationId && conversationId !== claims.conversationId) || typeof message.sdp !== "string" || message.sdp.length === 0 || message.sdp.length > 15_000 || state.activeForAgent(claims.userId)) throw new Error("Ya existe una llamada activa o la conversación no coincide.");
    const freshContext = await contextForConversation(claims, conversationId);
    const callId = `mgt_${crypto.randomUUID()}`;
    const record = { callId, agentId: claims.userId, workspaceId: claims.workspaceId, conversationId, phase: "outgoing" as const, direction: "OUTBOUND" as const, createdAt: Date.now(), peer: socket, context: freshContext };
    state.create(record);
    send(socket, "call:connecting", { callId, direction: "OUTBOUND" });
    try {
      await sendMetaCallAction({ apiVersion: freshContext.apiVersion, phoneNumberId: freshContext.phoneNumberId, accessToken: freshContext.metaAccessToken, to: freshContext.phone, action: "connect", sdp: message.sdp, callbackData: callId });
    } catch (error) {
      if (state.get(callId)) {
        try { state.transition(callId, "failed"); } catch { /* Meta ya notificó el estado terminal */ }
        await notifyMargarita(lifecycleEvent(record, "FAILED", { error: "Meta no permitió iniciar la llamada." })).catch(() => undefined);
        state.remove(callId);
      }
      throw error;
    }
    const current = state.get(callId);
    if (!current) return;
    if (current.phase === "outgoing") state.transition(callId, "connecting");
    await notifyMargarita(lifecycleEvent(record, "CONNECTING"));
    return;
  }

  const call = message.callId ? state.get(message.callId) : undefined;
  if (!call && message.event === "call:reject") return;
  if (!call && message.event === "call:hangup") { send(socket, "call:ended", { callId: message.callId }); return; }
  if (!call || call.agentId !== claims.userId || call.workspaceId !== claims.workspaceId || (claims.conversationId && call.conversationId !== claims.conversationId) || call.peer !== socket) throw new Error("La llamada ya no está disponible.");
  let context = call.context as CallContext;

  if (message.event === "call:sdp-answer" && call.direction === "INBOUND" && typeof message.sdp === "string") {
    if (call.phase !== "incoming") throw new Error("La llamada entrante ya expiró.");
    try {
      context = await contextForConversation(claims, call.conversationId);
      call.context = context;
      await performAction(context, "pre_accept", call.callId, message.sdp);
      state.transition(call.callId, "connecting");
      send(socket, "call:connecting", { callId: call.callId });
      await performAction(context, "accept", call.callId, message.sdp);
    } catch (error) {
      if (state.get(call.callId)) {
        try { state.transition(call.callId, "failed"); } catch { /* estado terminal */ }
        await performAction(context, "reject", call.callId).catch(() => undefined);
        await notifyMargarita(lifecycleEvent(call, "FAILED", { error: "No se pudo completar la llamada entrante." })).catch(() => undefined);
        state.remove(call.callId);
      }
      throw error;
    }
    if (!state.get(call.callId)) return;
    send(socket, "call:accepted", { callId: call.callId });
    await notifyMargarita(lifecycleEvent(call, "CONNECTING", { accepted: true }));
  } else if (message.event === "call:sdp-offer" && call.direction === "OUTBOUND" && typeof message.sdp === "string") {
    await performAction(context, "connect", undefined, message.sdp);
    state.transition(call.callId, "connecting");
    await notifyMargarita(lifecycleEvent(call, "CONNECTING"));
  } else if (message.event === "call:reject") {
    await performAction(context, "reject", call.metaCallId || call.callId);
    state.transition(call.callId, "rejected");
    send(socket, "call:rejected", { callId: call.callId });
    await notifyMargarita(lifecycleEvent(call, "REJECTED"));
    state.remove(call.callId);
  } else if (message.event === "call:hangup") {
    if (call.direction === "OUTBOUND" && !call.metaCallId) {
      call.cancelRequested = true;
      console.info("Colgado saliente en espera del identificador de Meta.", { callIdSuffix: call.callId.slice(-6) });
      return;
    }
    const metaCallId = call.metaCallId || call.callId;
    console.info("Solicitando terminar llamada en Meta.", { direction: call.direction, phase: call.phase, callIdSuffix: metaCallId.slice(-6) });
    await performAction(context, "terminate", metaCallId);
    const current = state.get(call.callId);
    if (current && current.phase !== "terminating" && current.phase !== "ended") {
      current.terminationWasActive = current.phase === "active";
      state.transition(call.callId, "terminating");
      console.info("Meta aceptó la solicitud de colgado; esperando confirmación de fin.", { direction: call.direction, callIdSuffix: metaCallId.slice(-6) });
    }
  } else if (message.event === "call:mute") {
    send(socket, "call:mute", { callId: call.callId, enabled: Boolean(message.enabled) });
  } else if (message.event === "call:media-ready") {
    state.transition(call.callId, "active");
    await notifyMargarita(lifecycleEvent(call, "ACTIVE", { accepted: true }));
  }
}

function closeSocket(socket: WebSocket): void {
  const claims = socketClaims.get(socket);
  if (claims && agentSockets.get(claims.userId) === socket) agentSockets.delete(claims.userId);
  for (const call of state.detachPeer(socket)) {
    if (call.direction === "INBOUND" && call.phase === "incoming") {
      call.agentId = call.recipientUserIds?.[0] || call.agentId;
      const connectedRecipients = (call.recipientUserIds || []).filter((userId) => {
        const recipient = agentSockets.get(userId);
        return recipient?.readyState === WebSocket.OPEN;
      });
      for (const userId of connectedRecipients) {
        const recipient = agentSockets.get(userId);
        if (recipient) dispatchPendingIncoming(userId, recipient);
      }
      const pushUserIds = (call.recipientUserIds || []).filter((userId) => {
        const recipient = agentSockets.get(userId);
        return !recipient || recipient.readyState !== WebSocket.OPEN || socketVisible.get(recipient) === false;
      });
      if (!call.peer) void notifyMargarita(lifecycleEvent(call, "RINGING", { recipientUserIds: call.recipientUserIds || [], pushUserIds })).catch(() => undefined);
      continue;
    }
    if (call.direction === "OUTBOUND" && !call.metaCallId) {
      call.cancelRequested = true;
      console.info("Llamada saliente se cancelará al recibir el identificador de Meta.", { callIdSuffix: call.callId.slice(-6) });
      continue;
    }
    const context = call.context as CallContext;
    const action = call.direction === "INBOUND" && call.phase === "incoming" ? "reject" : "terminate";
    void performAction(context, action, call.metaCallId || call.callId).then(async () => {
      const current = state.get(call.callId);
      if (!current) return;
      if (action === "reject") {
        try { state.transition(call.callId, "rejected"); } catch { /* estado terminal */ }
        await notifyMargarita(lifecycleEvent(call, "MISSED", { error: "El panel se desconectó antes de contestar." }));
        state.remove(call.callId);
        return;
      }
      if (current.phase !== "terminating" && current.phase !== "ended") {
        current.terminationWasActive = current.phase === "active";
        state.transition(call.callId, "terminating");
      }
      const timeout = setTimeout(() => {
        const pending = state.get(call.callId);
        if (!pending || pending.phase !== "terminating") return;
        state.remove(call.callId);
        void notifyMargarita(lifecycleEvent(call, "FAILED", { error: "Meta no confirmó el fin al perderse la conexión del panel." })).catch(() => undefined);
      }, 30_000);
      timeout.unref();
    }).catch(async () => {
      const current = state.get(call.callId);
      if (!current) return;
      try { state.transition(call.callId, "failed"); } catch { /* estado terminal */ }
      await notifyMargarita(lifecycleEvent(call, "FAILED", { error: "No se pudo terminar la llamada al perderse la conexión del panel." })).catch(() => undefined);
      state.remove(call.callId);
    });
  }
}

export function attachCallSignaling(server: Server): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", "http://localhost");
    const ip = req.socket.remoteAddress || "unknown";
    if (url.pathname !== "/signal" || !safeOrigin(req.headers.origin) || !hitRateLimit(ip)) { socket.destroy(); return; }
    const token = wsToken(req);
    if (!token) { socket.destroy(); return; }
    let claims: CallClaims;
    try { claims = verifyCallToken(token); } catch { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (client) => wss.emit("connection", client, req, claims));
  });
  wss.on("connection", (socket: WebSocket, _req: IncomingMessage, claims: CallClaims) => {
    const ready = claims.scope === "presence" ? validatePresence(claims) : contextForClaims(claims);
    void ready.then(() => {
      socketClaims.set(socket, claims);
      socketVisible.set(socket, false);
      const previous = agentSockets.get(claims.userId);
      if (previous && previous !== socket) previous.close(4001, "Sesión de llamada reemplazada");
      agentSockets.set(claims.userId, socket);
      send(socket, "call:ready", { iceServers: [] });
      dispatchPendingIncoming(claims.userId, socket);
      socket.on("message", (raw) => {
        try {
          const input = JSON.parse(raw.toString()) as ClientMessage;
          const previous = socketTasks.get(socket) || Promise.resolve();
          const task = previous.then(() => handleClientMessage(socket, input)).catch((error: unknown) => reportClientActionError(socket, error, input.event || "unknown"));
          socketTasks.set(socket, task);
        } catch { send(socket, "call:error", { message: "Mensaje de llamada inválido." }); }
      });
      socket.on("close", () => closeSocket(socket));
      socket.on("error", () => closeSocket(socket));
    }).catch(() => { send(socket, "call:error", { message: "Tu sesión ya no tiene acceso a esta llamada." }); socket.close(4003); });
  });
}

export async function handleInternalWebhook(payload: unknown): Promise<{ accepted: number }> {
  const calls = parseCallWebhooks(payload);
  for (const call of calls) sendCallEvent(call);
  return { accepted: calls.length };
}

export async function turnResponse(token: string): Promise<{ iceServers: unknown[]; expiresAt: number }> {
  const claims = verifyCallToken(token);
  if (claims.scope === "presence") await validatePresence(claims);
  else await contextForClaims(claims);
  const turn = await getTurnCredentials();
  return { iceServers: turn.iceServers, expiresAt: turn.expiresAt };
}
