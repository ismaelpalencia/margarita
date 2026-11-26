export type CallPhase = "incoming" | "outgoing" | "connecting" | "active" | "terminating" | "ended" | "rejected" | "failed";
export type CallRecord = { callId: string; metaCallId?: string; agentId: string; workspaceId: string; conversationId: string; phase: CallPhase; direction: "INBOUND" | "OUTBOUND"; createdAt: number; peer?: unknown; context?: unknown; incomingSdp?: string; recipientUserIds?: string[]; notifiedUserIds?: string[]; terminationWasActive?: boolean; cancelRequested?: boolean };
export type IncomingRecipientCandidate = { userId: string; role: string; workspaceId: string; conversationId: string; ready: boolean; assignedAgentCanCall: boolean; adminCanCall: boolean; hasActiveCall: boolean };

const callEventFields = ["workspaceId", "conversationId", "agentId", "metaCallId", "localCallId", "direction", "status", "accepted", "durationSeconds", "error", "recipientUserIds", "pushUserIds", "closePushUserIds"] as const;

export function safeCallEventPayload(event: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(callEventFields.filter((key) => event[key] !== undefined).map((key) => [key, event[key]]));
}

export function finalCallStatus(phase: CallPhase, terminationWasActive = false): "COMPLETED" | "MISSED" {
  return phase === "active" || (phase === "terminating" && terminationWasActive) ? "COMPLETED" : "MISSED";
}

export function chooseIncomingRecipient(candidates: IncomingRecipientCandidate[], target: { workspaceId: string; conversationId: string; assignedAgentId: string }): IncomingRecipientCandidate | undefined {
  const matches = candidates.filter((candidate) => candidate.ready && !candidate.hasActiveCall && candidate.workspaceId === target.workspaceId && candidate.conversationId === target.conversationId);
  return matches.find((candidate) => candidate.userId === target.assignedAgentId && candidate.role === "AGENT" && candidate.assignedAgentCanCall)
    || matches.find((candidate) => candidate.role === "ADMIN" && candidate.adminCanCall);
}

const transitions: Record<CallPhase, CallPhase[]> = {
  incoming: ["connecting", "terminating", "rejected", "ended", "failed"],
  outgoing: ["connecting", "terminating", "rejected", "ended", "failed"],
  connecting: ["active", "terminating", "rejected", "ended", "failed"],
  active: ["terminating", "ended", "failed"],
  terminating: ["ended", "failed"], ended: [], rejected: [], failed: []
};

export class CallStateStore {
  private readonly calls = new Map<string, CallRecord>();
  create(call: CallRecord): void {
    if (this.calls.has(call.callId)) throw new Error("La llamada ya existe.");
    this.calls.set(call.callId, call);
  }
  get(callId: string): CallRecord | undefined { return this.calls.get(callId); }
  findByMetaCallId(metaCallId: string): CallRecord | undefined { return [...this.calls.values()].find((call) => call.metaCallId === metaCallId); }
  transition(callId: string, phase: CallPhase): CallRecord {
    const current = this.calls.get(callId);
    if (!current || !transitions[current.phase].includes(phase)) throw new Error("Transición de llamada inválida.");
    current.phase = phase;
    return current;
  }
  remove(callId: string): void { this.calls.delete(callId); }
  clearPeer(peer: unknown): CallRecord[] {
    const removed: CallRecord[] = [];
    for (const [id, call] of this.calls) if (call.peer === peer) { this.calls.delete(id); removed.push(call); }
    return removed;
  }
  detachPeer(peer: unknown): CallRecord[] {
    const detached: CallRecord[] = [];
    for (const call of this.calls.values()) {
      if (call.peer === peer) { call.peer = undefined; detached.push(call); }
    }
    return detached;
  }
  activeForAgent(agentId: string): CallRecord | undefined { return [...this.calls.values()].find((call) => call.agentId === agentId && !["ended", "rejected", "failed"].includes(call.phase)); }
  pendingIncomingForUser(userId: string): CallRecord[] { return [...this.calls.values()].filter((call) => call.direction === "INBOUND" && call.phase === "incoming" && !call.peer && call.recipientUserIds?.includes(userId)); }
  claimIncoming(callId: string, userId: string, peer: unknown): CallRecord | undefined {
    const call = this.calls.get(callId);
    if (!call || call.direction !== "INBOUND" || call.phase !== "incoming" || call.peer || !call.recipientUserIds?.includes(userId)) return undefined;
    call.peer = peer;
    call.agentId = userId;
    return call;
  }
}
