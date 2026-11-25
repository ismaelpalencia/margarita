import http from "node:http";
import { hasInternalSecret } from "./auth";
import { attachCallSignaling, handleInternalWebhook, turnResponse } from "./signaling";
import { healthPayload } from "./health";

const port = Number(process.env.PORT) || 4100;
const internalSecret = process.env.CALLS_INTERNAL_SECRET || "";
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(healthPayload()));
    return;
  }
  if (req.method === "OPTIONS" && ["/turn-credentials"].includes(url.pathname)) {
    const origin = req.headers.origin;
    let allowed = false;
    try { allowed = Boolean(origin && new URL(origin).origin === new URL(process.env.MARGARITA_INTERNAL_URL || "").origin); } catch { /* host inválido */ }
    if (!allowed) { res.writeHead(403).end(); return; }
    res.setHeader("Access-Control-Allow-Origin", origin!);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.writeHead(204).end();
    return;
  }
  if (req.method === "GET" && url.pathname === "/turn-credentials") {
    const origin = req.headers.origin;
    let allowed = false;
    try { allowed = Boolean(origin && new URL(origin).origin === new URL(process.env.MARGARITA_INTERNAL_URL || "").origin); } catch { /* host inválido */ }
    if (!allowed) { res.writeHead(403).end(); return; }
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    try {
      const result = await turnResponse(token);
      res.setHeader("Access-Control-Allow-Origin", origin!);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(result));
    } catch {
      res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "No fue posible autorizar credenciales ICE." }));
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/internal/webhook") {
    if (!hasInternalSecret(internalSecret, req.headers.authorization)) { res.writeHead(401).end(); return; }
    try {
      let raw = "";
      for await (const chunk of req) { raw += chunk.toString(); if (raw.length > 1_500_000) throw new Error("Payload demasiado grande."); }
      const body = await handleInternalWebhook(JSON.parse(raw));
      res.writeHead(202, { "Content-Type": "application/json" }).end(JSON.stringify(body));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Webhook de llamada inválido." }));
    }
    return;
  }
  res.writeHead(404).end();
});

attachCallSignaling(server);
server.listen(port, "0.0.0.0", () => console.info(`Call Service escuchando en ${port}.`));
