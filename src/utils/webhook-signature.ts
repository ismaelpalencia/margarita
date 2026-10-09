import crypto from "node:crypto";

type VerifyMetaSignatureParams = {
    rawBody?: string | Buffer | null;
    signatureHeader?: string | string[] | null;
    appSecret?: string | null;
};

const SIGNATURE_PREFIX = "sha256=";

/**
 * Valida la cabecera X-Hub-Signature-256 que Meta envía en cada webhook.
 * Meta firma el cuerpo crudo con HMAC-SHA256 usando el App Secret.
 */
export function verifyMetaSignature(params: VerifyMetaSignatureParams): boolean {
    const { rawBody, signatureHeader, appSecret } = params;

    if (!rawBody || !signatureHeader || !appSecret) {
        return false;
    }

    const header = Array.isArray(signatureHeader)
        ? signatureHeader[0]
        : signatureHeader;

    if (typeof header !== "string" || !header.startsWith(SIGNATURE_PREFIX)) {
        return false;
    }

    const receivedHex = header.slice(SIGNATURE_PREFIX.length).trim();

    if (!/^[0-9a-f]{64}$/i.test(receivedHex)) {
        return false;
    }

    const received = Buffer.from(receivedHex, "hex");

    const expected = crypto
        .createHmac("sha256", appSecret)
        .update(
            typeof rawBody === "string"
                ? Buffer.from(rawBody, "utf8")
                : rawBody
        )
        .digest();

    if (received.length !== expected.length) {
        return false;
    }

    return crypto.timingSafeEqual(received, expected);
}
