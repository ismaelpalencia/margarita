import assert from "node:assert/strict";
import test from "node:test";
import { clearTurnCache, filterPort53, getTurnCredentials } from "./turn";

test("solicita credenciales TURN cortas, quita puerto 53 y cachea hasta expirar", async () => {
  process.env.CLOUDFLARE_TURN_KEY_ID = "turn-key";
  process.env.CLOUDFLARE_TURN_API_TOKEN = "server-only-token";
  clearTurnCache();
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++;
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer server-only-token");
    assert.deepEqual(JSON.parse(String(init?.body)), { ttl: 3600 });
    return Response.json({ iceServers: [{ urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp"], username: "u", credential: "p" }] }, { status: 201 });
  };
  const first = await getTurnCredentials({ fetcher, now: 1000 });
  const cached = await getTurnCredentials({ fetcher, now: 2000 });
  assert.equal(calls, 1);
  assert.deepEqual(first.iceServers[0].urls, ["turn:turn.cloudflare.com:3478?transport=udp"]);
  assert.equal(cached.expiresAt, first.expiresAt);
  clearTurnCache();
});

test("el filtro ICE también excluye URLs por puerto 53", () => {
  assert.deepEqual(filterPort53([{ urls: ["turn:example.com:53?transport=tcp", "turns:example.com:443?transport=tcp"] }]), [{ urls: ["turns:example.com:443?transport=tcp"] }]);
});
