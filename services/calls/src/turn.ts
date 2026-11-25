export type IceServer = { urls: string | string[]; username?: string; credential?: string };
type TurnResponse = { iceServers?: IceServer[] };

let cached: { iceServers: IceServer[]; expiresAt: number } | null = null;

function filtered(iceServers: IceServer[]): IceServer[] {
  return iceServers.map((server) => ({
    ...server,
    urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((url) => !/:53(?:\?|$)/.test(url))
  })).filter((server) => Array.isArray(server.urls) && server.urls.length > 0);
}

export async function getTurnCredentials(options: {
  fetcher?: typeof fetch;
  now?: number;
  force?: boolean;
  ttl?: number;
} = {}): Promise<{ iceServers: IceServer[]; expiresAt: number }> {
  const now = options.now ?? Date.now();
  if (!options.force && cached && cached.expiresAt > now + 60_000) return cached;
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !apiToken) throw new Error("TURN no está configurado.");
  const ttl = Math.min(172800, Math.max(300, options.ttl ?? 3600));
  const response = await (options.fetcher ?? fetch)(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl }),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Cloudflare TURN respondió ${response.status}.`);
  const body = await response.json() as TurnResponse;
  if (!body.iceServers?.length) throw new Error("Cloudflare no devolvió servidores ICE.");
  cached = { iceServers: filtered(body.iceServers), expiresAt: now + ttl * 1000 };
  return cached;
}

export function clearTurnCache(): void { cached = null; }
export function filterPort53(iceServers: IceServer[]): IceServer[] { return filtered(iceServers); }
