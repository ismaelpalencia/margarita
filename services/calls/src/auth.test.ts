import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { hasInternalSecret, verifyCallToken } from "./auth";

const secret = "12345678901234567890123456789012";
const claims = { userId: "user-1", workspaceId: "workspace-1", role: "AGENT", conversationId: "conversation-1" };

test("acepta un JWT firmado para llamada", () => {
  const token = jwt.sign(claims, secret, { expiresIn: 300 });
  assert.equal(verifyCallToken(token, secret).conversationId, claims.conversationId);
});

test("rechaza un JWT vencido, alterado o sin claims requeridos", () => {
  assert.throws(() => verifyCallToken(jwt.sign(claims, secret, { expiresIn: -1 }), secret));
  assert.throws(() => verifyCallToken(jwt.sign(claims, "otro-secreto"), secret));
  assert.throws(() => verifyCallToken(jwt.sign({ userId: "x" }, secret), secret));
});

test("valida el secreto interno como bearer y en tiempo constante", () => {
  assert.equal(hasInternalSecret(secret, `Bearer ${secret}`), true);
  assert.equal(hasInternalSecret(secret, `Bearer ${secret}x`), false);
  assert.equal(hasInternalSecret(secret, secret), false);
  assert.equal(hasInternalSecret("", `Bearer ${secret}`), false);
});
