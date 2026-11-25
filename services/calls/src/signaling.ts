import crypto from "node:crypto";
import { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { CallClaims, verifyCallToken } from "./auth";
import { MetaCallAction, MetaCallApiError, ParsedCall, parseCallWebhooks, sendMetaCallAction } from "./meta-calls";
import { chooseIncomingRecipient, CallStateStore, finalCallStatus } from "./state";
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
  direction?: string;
  callId?: string;
};
type ClientMessage = { event?: string; callId?: string; conversationId?: string; sdp?: string; enabled?: boolean };

const state = new CallStateStore();
const agentSockets = new Map<string, WebSocket>();
const socketClaims = new WeakMap<WebSocket, CallClaims>();
const socketContexts = new WeakMap<WebSocket, CallContext>();
const socketTasks = new WeakMap<WebSocket, Promise<void>>();
const rate = new Map<string, { at: number; count: number }>();

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
  await callInternal("/internal/calls/events", event);
}

async function contextForClaims(claims: CallClaims): Promise<CallContext> {
  const result = await callInternal<{ context: CallContext }>("/internal/calls/context", {
    purpose: "conversation", userId: claims.userId, workspaceId: claims.workspaceId,
    conversationId: claims.conversationId, role: claims.role
  });
  if (!result.context?.canCall || result.context.agentId !== claims.userId) throw new Error("La conversación ya no está disponible para llamadas.");
  return result.context;
}

function wsToken(req: IncomingMessage): string | null {
  const url = new URL(req.url || "/", "http://localhost");
  return url.searchParams.get("token");
}

function hitRateLimit(ip: string): boolean {
  const now = Date.now();
  const current = rate.get(ip);
  if (!current || now - current.at >= 60_000) { rate.set(ip, { at: now, count: 1 }); return true; }
  current.count++;
  return current.count <= 30;
}

function sendCallEvent(call: ParsedCall): void {
  void handleMetaCall(call).catch((error: unknown) => console.warn("No se pudo gestionar un evento entrante de llamadas.", { event: call.event, status: call.status || "unknown", errorName: error instanceof Error ? error.name : "UnknownError" }));
}

async function handleMetaCall(incoming: ParsedCall): Promise<void> {
  if (incoming.event === "connect" && incoming.direction === "USER_INITIATED") {
    const result = await callInternal<{ context?: CallContext }>("/internal/calls/context", {
      purpose: "incoming", phoneNumberId: incoming.phoneNumberId, phone: incoming.from, callId: incoming.id
    });
    const context = result.context;
    const candidates = [...agentSockets.entries()].map(([userId, candidate]) => {
      const claims = socketClaims.get(candidate);
      return { userId, socket: candidate, claims, role: claims?.role || "", workspaceId: claims?.workspaceId || "", conversationId: claims?.conversationId || "", ready: candidate.readyState === WebSocket.OPEN, assignedAgentCanCall: userId === context?.agentId && Boolean(context?.assignedAgentCanCall), hasActiveCall: Boolean(state.activeForAgent(userId)) };
    });
    const selectedCandidate = context ? chooseIncomingRecipient(candidates, { workspaceId: context.workspaceId, conversationId: context.conversationId, assignedAgentId: context.agentId }) : undefined;
    const selected = selectedCandidate && candidates.find((candidate) => candidate.userId === selectedCandidate.userId);
    if (!context?.canCall || !selected || !selected.claims || !incoming.sdp) {
      const reason = !context?.canCall ? "conversation_not_eligible" : !incoming.sdp ? "offer_missing" : !selected ? "no_authorized_panel_open_or_already_in_call" : "no_authorized_panel_open";
      console.info("Llamada entrante rechazada por disponibilidad.", { event: incoming.event, reason });
      if (context?.phoneNumberId && context.metaAccessToken) {
        await sendMetaCallAction({ apiVersion: context.apiVersion, phoneNumberId: context.phoneNumberId, accessToken: context.metaAccessToken, action: "reject", callId: incoming.id });
      }
      if (context) await notifyMargarita({ ...context, metaCallId: incoming.id, direction: "INBOUND", status: "MISSED", error: "No había un agente disponible en el panel." });
      return;
    }
    const callContext = { ...context, agentId: selected.userId };
    state.create({ callId: incoming.id, agentId: selected.userId, workspaceId: context.workspaceId, conversationId: context.conversationId, phase: "incoming", direction: "INBOUND", createdAt: Date.now(), peer: selected.socket, context: callContext });
    socketContexts.set(selected.socket, callContext);
    send(selected.socket, "call:incoming", { callId: incoming.id, conversationId: context.conversationId, phone: context.phone, sdp: incoming.sdp });
    console.info("Llamada entrante entregada al panel.", { recipientRole: selected.claims.role, callIdSuffix: incoming.id.slice(-6) });
    await notifyMargarita({ ...callContext, metaCallId: incoming.id, direction: "INBOUND", status: "RINGING" });
    return;
  }

  const current = state.get(incoming.id)
    || (incoming.callbackData ? state.get(incoming.callbackData) : undefined)
    || state.findByMetaCallId(incoming.id);
  if (!current) return;
  const context = current.context as CallContext;
  const socket = current.peer as WebSocket;
  if (incoming.event === "rejected" || incoming.status === "REJECTED") {
    try { state.transition(current.callId, "rejected"); } catch { /* estado terminal */ }
    send(socket, "call:rejected", { callId: current.callId, message: incoming.error || "El contacto rechazó la llamada." });
    await notifyMargarita({ ...context, metaCallId: current.callId, direction: current.direction, status: "REJECTED", error: incoming.error });
    state.remove(current.callId);
    return;
  }
  if (incoming.event === "terminate" || incoming.status === "COMPLETED") {
    const finalStatus = incoming.error ? "FAILED" : finalCallStatus(current.phase);
    try { state.transition(current.callId, "ended"); } catch { /* estado terminal */ }
    if (incoming.error) send(socket, "call:error", { callId: current.callId, message: incoming.error });
    else send(socket, "call:ended", { callId: current.callId, durationSeconds: incoming.duration ?? null });
    await notifyMargarita({ ...context, metaCallId: current.metaCallId || current.callId, direction: current.direction, status: finalStatus, durationSeconds: incoming.duration, error: incoming.error });
    console.info("Llamada finalizada por evento Meta.", { direction: current.direction, status: finalStatus, callIdSuffix: current.callId.slice(-6) });
    state.remove(current.callId);
    return;
  }
  if (["accepted", "ringing"].includes(incoming.event) || ["ACCEPTED", "RINGING"].includes(incoming.status || "")) {
    send(socket, incoming.status === "ACCEPTED" || incoming.event === "accepted" ? "call:accepted" : "call:connecting", { callId: incoming.id });
  }
  if (incoming.sdp && current.direction === "OUTBOUND") {
    current.metaCallId = incoming.id;
    send(socket, "call:answer", { callId: current.callId, sdp: incoming.sdp });
  }
}

async function performAction(context: CallContext, action: MetaCallAction, callId?: string, sdp?: string): Promise<void> {
  await sendMetaCallAction({ apiVersion: context.apiVersion, phoneNumberId: context.phoneNumberId, accessToken: context.metaAccessToken, to: context.phone, action, callId, sdp });
}

async function handleClientMessage(socket: WebSocket, message: ClientMessage): Promise<void> {
  const claims = socketClaims.get(socket);
  const defaultContext = socketContexts.get(socket);
  if (!claims || !defaultContext || typeof message.event !== "string") return;

  if (message.event === "call:start") {
    if (message.conversationId !== claims.conversationId || !message.sdp || state.activeForAgent(claims.userId)) throw new Error("Ya existe una llamada activa o la conversación no coincide.");
    const callId = `mgt_${crypto.randomUUID()}`;
    const record = { callId, agentId: claims.userId, workspaceId: claims.workspaceId, conversationId: claims.conversationId, phase: "outgoing" as const, direction: "OUTBOUND" as const, createdAt: Date.now(), peer: socket, context: defaultContext };
    state.create(record);
    socketContexts.set(socket, defaultContext);
    send(socket, "call:connecting", { callId, direction: "OUTBOUND" });
    try {
      await sendMetaCallAction({ apiVersion: defaultContext.apiVersion, phoneNumberId: defaultContext.phoneNumberId, accessToken: defaultContext.metaAccessToken, to: defaultContext.phone, action: "connect", sdp: message.sdp, callbackData: callId });
      state.transition(callId, "connecting");
    } catch (error) {
      state.transition(callId, "failed");
      await notifyMargarita({ ...defaultContext, metaCallId: callId, direction: "OUTBOUND", status: "FAILED", error: "Meta no permitió iniciar la llamada." }).catch(() => undefined);
      state.remove(callId);
      throw error;
    }
    await notifyMargarita({ ...defaultContext, metaCallId: callId, direction: "OUTBOUND", status: "CONNECTING" });
    return;
  }

  const call = message.callId ? state.get(message.callId) : undefined;
  if (!call && message.event === "call:reject") return;
  if (!call && message.event === "call:hangup") { send(socket, "call:ended", { callId: message.callId }); return; }
  if (!call || call.agentId !== claims.userId || call.workspaceId !== claims.workspaceId || call.conversationId !== claims.conversationId || call.peer !== socket) throw new Error("La llamada ya no está disponible.");
  const context = call.context as CallContext;

  if (message.event === "call:sdp-answer" && call.direction === "INBOUND" && typeof message.sdp === "string") {
    try {
      await performAction(context, "pre_accept", call.callId, message.sdp);
      state.transition(call.callId, "connecting");
      send(socket, "call:connecting", { callId: call.callId });
      await performAction(context, "accept", call.callId, message.sdp);
      state.transition(call.callId, "active");
    } catch (error) {
      try { state.transition(call.callId, "failed"); } catch { /* estado terminal */ }
      await performAction(context, "reject", call.callId).catch(() => undefined);
      await notifyMargarita({ ...context, metaCallId: call.callId, direction: "INBOUND", status: "FAILED", error: "No se pudo completar la llamada entrante." }).catch(() => undefined);
      state.remove(call.callId);
      throw error;
    }
    send(socket, "call:accepted", { callId: call.callId });
    await notifyMargarita({ ...context, metaCallId: call.callId, direction: "INBOUND", status: "ACTIVE", accepted: true });
  } else if (message.event === "call:sdp-offer" && call.direction === "OUTBOUND" && typeof message.sdp === "string") {
    await performAction(context, "connect", undefined, message.sdp);
    state.transition(call.callId, "connecting");
    await notifyMargarita({ ...context, metaCallId: call.callId, direction: "OUTBOUND", status: "CONNECTING" });
  } else if (message.event === "call:reject") {
    await performAction(context, "reject", call.metaCallId || call.callId);
    state.transition(call.callId, "rejected");
    send(socket, "call:rejected", { callId: call.callId });
    await notifyMargarita({ ...context, metaCallId: call.callId, direction: call.direction, status: "REJECTED" });
    state.remove(call.callId);
  } else if (message.event === "call:hangup") {
    const metaCallId = call.metaCallId || call.callId;
    console.info("Solicitando terminar llamada en Meta.", { direction: call.direction, phase: call.phase, callIdSuffix: metaCallId.slice(-6) });
    await performAction(context, "terminate", metaCallId);
    const current = state.get(call.callId);
    if (current && current.phase !== "terminating") {
      state.transition(call.callId, "terminating");
      console.info("Meta aceptó la solicitud de colgado; esperando confirmación de fin.", { direction: call.direction, callIdSuffix: metaCallId.slice(-6) });
    }
  } else if (message.event === "call:mute") {
    send(socket, "call:mute", { callId: call.callId, enabled: Boolean(message.enabled) });
  } else if (message.event === "call:media-ready") {
    state.transition(call.callId, "active");
    await notifyMargarita({ ...context, metaCallId: call.callId, direction: call.direction, status: "ACTIVE", accepted: true });
  }
}

function closeSocket(socket: WebSocket): void {
  const claims = socketClaims.get(socket);
  if (claims && agentSockets.get(claims.userId) === socket) agentSockets.delete(claims.userId);
  for (const call of state.clearPeer(socket)) {
    const context = call.context as CallContext;
    const action = call.direction === "INBOUND" && call.phase === "incoming" ? "reject" : "terminate";
    void performAction(context, action, call.metaCallId || call.callId).catch(() => undefined).finally(() => {
      void notifyMargarita({ ...context, metaCallId: call.callId, direction: call.direction, status: call.phase === "incoming" ? "MISSED" : "COMPLETED", error: "El agente cerró o perdió la conexión." }).catch(() => undefined);
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
    void contextForClaims(claims).then((context) => {
      socketClaims.set(socket, claims);
      socketContexts.set(socket, context);
      const previous = agentSockets.get(claims.userId);
      if (previous && previous !== socket) previous.close(4001, "Sesión de llamada reemplazada");
      agentSockets.set(claims.userId, socket);
      send(socket, "call:ready", { iceServers: [] });
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
  await contextForClaims(claims);
  const turn = await getTurnCredentials();
  return { iceServers: turn.iceServers, expiresAt: turn.expiresAt };
}
