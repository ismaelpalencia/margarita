export type MetaCallAction = "pre_accept" | "accept" | "reject" | "terminate" | "connect";

export class MetaCallApiError extends Error {
  constructor(readonly action: MetaCallAction, readonly httpStatus: number, readonly metaCode?: number, readonly metaSubcode?: number) {
    super(`Meta rechazó la acción de llamada (HTTP ${httpStatus}${metaCode ? `, código ${metaCode}` : ""}${metaSubcode ? `/${metaSubcode}` : ""}).`);
    this.name = "MetaCallApiError";
  }
}

export async function sendMetaCallAction(input: {
  apiVersion: string;
  phoneNumberId: string;
  accessToken: string;
  action: MetaCallAction;
  callId?: string;
  to?: string;
  callbackData?: string;
  sdp?: string;
  fetcher?: typeof fetch;
}): Promise<void> {
  const body: Record<string, unknown> = { messaging_product: "whatsapp", action: input.action };
  if (input.callId) body.call_id = input.callId;
  if (input.action === "connect") {
    if (!input.to || !input.sdp) throw new Error("Faltan datos para iniciar la llamada.");
    body.to = input.to;
    body.session = { sdp_type: "offer", sdp: input.sdp };
    if (input.callbackData) body.biz_opaque_callback_data = input.callbackData;
  } else if (input.action === "pre_accept" || input.action === "accept") {
    if (!input.callId || !input.sdp) throw new Error(`Faltan datos para ${input.action === "pre_accept" ? "preparar" : "aceptar"} la llamada.`);
    body.session = { sdp_type: "answer", sdp: input.sdp };
  }
  const response = await (input.fetcher ?? fetch)(`https://graph.facebook.com/${encodeURIComponent(input.apiVersion)}/${encodeURIComponent(input.phoneNumberId)}/calls`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({})) as { error?: { code?: number; error_subcode?: number } };
    throw new MetaCallApiError(input.action, response.status, errorBody.error?.code, errorBody.error?.error_subcode);
  }
}

export type ParsedCall = {
  id: string;
  event: string;
  direction: "USER_INITIATED" | "BUSINESS_INITIATED";
  from: string;
  to: string;
  phoneNumberId: string;
  sdp?: string;
  sdpType?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
  error?: string;
  callbackData?: string;
};

export function parseCallWebhooks(payload: unknown): ParsedCall[] {
  if (!payload || typeof payload !== "object") return [];
  const calls: ParsedCall[] = [];
  const entries = (payload as { entry?: unknown[] }).entry;
  if (!Array.isArray(entries)) return calls;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = (entry as { changes?: unknown[] }).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      if (!change || typeof change !== "object" || (change as { field?: string }).field !== "calls") continue;
      const value = (change as { value?: { metadata?: { phone_number_id?: string }; calls?: unknown[]; statuses?: unknown[] } }).value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;
      for (const raw of [...(value.calls ?? []), ...(value.statuses ?? [])]) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as Record<string, unknown>;
        if (typeof item.id !== "string" || item.id.length === 0 || item.id.length > 180) continue;
        const direction = item.direction === "BUSINESS_INITIATED" ? "BUSINESS_INITIATED" : "USER_INITIATED";
        const session = item.session && typeof item.session === "object" ? item.session as Record<string, unknown> : undefined;
        const errors = Array.isArray(item.errors) ? item.errors : [];
        const firstError = errors[0] && typeof errors[0] === "object" ? errors[0] as Record<string, unknown> : undefined;
        calls.push({
          id: item.id,
          event: String(item.event ?? item.status ?? "unknown").toLowerCase(),
          direction,
          from: String(item.from ?? item.recipient_id ?? ""),
          to: String(item.to ?? ""),
          phoneNumberId,
          ...(typeof session?.sdp === "string" ? { sdp: session.sdp } : {}),
          ...(typeof session?.sdp_type === "string" ? { sdpType: session.sdp_type } : {}),
          ...(typeof item.status === "string" ? { status: item.status } : {}),
          ...(item.start_time ? { startTime: String(item.start_time) } : {}),
          ...(item.end_time ? { endTime: String(item.end_time) } : {}),
          ...(typeof item.duration === "number" ? { duration: item.duration } : {}),
          ...(typeof item.biz_opaque_callback_data === "string" ? { callbackData: item.biz_opaque_callback_data } : {}),
          ...(firstError ? { error: `Meta rechazó la llamada${firstError.code ? ` (código ${String(firstError.code)})` : ""}.` } : {})
        });
      }
    }
  }
  return calls;
}
