export type CallPhase = "incoming" | "outgoing" | "connecting" | "active" | "ended" | "rejected" | "failed";
export type CallRecord = { callId: string; metaCallId?: string; agentId: string; workspaceId: string; conversationId: string; phase: CallPhase; direction: "INBOUND" | "OUTBOUND"; createdAt: number; peer?: unknown; context?: unknown };

const transitions: Record<CallPhase, CallPhase[]> = {
  incoming: ["connecting", "rejected", "ended", "failed"],
  outgoing: ["connecting", "rejected", "ended", "failed"],
  connecting: ["active", "rejected", "ended", "failed"],
  active: ["ended", "failed"], ended: [], rejected: [], failed: []
};

export class CallStateStore {
  private readonly calls = new Map<string, CallRecord>();
  create(call: CallRecord): void {
    if (this.calls.has(call.callId)) throw new Error("La llamada ya existe.");
    this.calls.set(call.callId, call);
  }
  get(callId: string): CallRecord | undefined { return this.calls.get(callId); }
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
  activeForAgent(agentId: string): CallRecord | undefined { return [...this.calls.values()].find((call) => call.agentId === agentId && !["ended", "rejected", "failed"].includes(call.phase)); }
}
