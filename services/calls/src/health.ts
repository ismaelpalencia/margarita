export function healthPayload(): { ok: true; service: string; timestamp: string } {
  return { ok: true, service: "margarita-calls", timestamp: new Date().toISOString() };
}
