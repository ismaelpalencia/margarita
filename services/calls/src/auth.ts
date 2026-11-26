import crypto from "node:crypto";
import jwt, { JwtPayload } from "jsonwebtoken";

export type CallClaims = JwtPayload & {
  userId: string;
  workspaceId: string;
  role: "AGENT" | "ADMIN";
  conversationId?: string;
  scope?: "presence" | "conversation";
};

export function hasInternalSecret(secret: string, authorization: string | undefined): boolean {
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

export function verifyCallToken(token: string, secret = process.env.CALLS_JWT_SECRET || ""): CallClaims {
  if (secret.length < 32) throw new Error("CALLS_JWT_SECRET no está configurado.");
  const claims = jwt.verify(token, secret, { algorithms: ["HS256"] });
  if (typeof claims === "string" || !claims.userId || !claims.workspaceId || !["AGENT", "ADMIN"].includes(String(claims.role)) || (claims.scope !== "presence" && !claims.conversationId)) {
    throw new Error("Token de llamada inválido.");
  }
  return claims as CallClaims;
}
