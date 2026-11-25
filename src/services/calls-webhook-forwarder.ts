import { MetaWebhookPayload } from "../types/meta-webhook";

export async function forwardCallingWebhook(
    payload: MetaWebhookPayload,
    options: { serviceUrl: string; internalSecret: string; fetcher?: typeof fetch }
): Promise<void> {
    const hasCallingEvent = (payload.entry || []).some((entry) =>
        (entry.changes || []).some((change) => change.field === "calls")
    );
    if (!hasCallingEvent || !options.internalSecret || !options.serviceUrl) return;
    const callingPayload: MetaWebhookPayload = {
        object: payload.object,
        entry: (payload.entry || []).map((entry) => ({
            id: entry.id,
            changes: (entry.changes || []).filter((change) => change.field === "calls")
        })).filter((entry) => (entry.changes || []).length > 0)
    };
    const response = await (options.fetcher ?? fetch)(`${options.serviceUrl}/internal/webhook`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${options.internalSecret}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(callingPayload),
        signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error(`El servicio de llamadas respondió ${response.status}.`);
}

/** Evita que la cola histórica de mensajes guarde llamadas o SDP. */
export function withoutCallChanges(payload: MetaWebhookPayload): MetaWebhookPayload {
    return {
        ...payload,
        entry: (payload.entry || []).map((entry) => ({
            ...entry,
            changes: (entry.changes || []).filter((change) => change.field !== "calls")
        })).filter((entry) => (entry.changes || []).length > 0)
    };
}
