import crypto from "node:crypto";

import { appConfig } from "../config/app.config";

/**
 * Cliente mínimo para el protocolo S3 de Cloudflare R2.
 *
 * Se firma a mano (SigV4) para no agregar dependencias: son cuatro operaciones
 * —subir, bajar, borrar y preguntar— y el algoritmo está probado contra el
 * vector de ejemplo de AWS.
 */

export type ObjectStorageConfig = {
    accountId: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
};

export function objectStorageConfig(): ObjectStorageConfig | null {
    const config = {
        accountId: process.env.R2_ACCOUNT_ID?.trim() || "",
        bucket: process.env.R2_BUCKET?.trim() || "",
        accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim() || "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim() || ""
    };

    return Object.values(config).every(Boolean) ? config : null;
}

const sha256Hex = (value: Buffer | string) =>
    crypto.createHash("sha256").update(value).digest("hex");

const hmac = (key: Buffer | string, value: string) =>
    crypto.createHmac("sha256", key).update(value).digest();

export function signRequest(params: {
    method: string;
    host: string;
    /** Ruta ya codificada, empezando con `/`. */
    path: string;
    /** Query canónica (ya ordenada y codificada), sin `?`. */
    query?: string;
    payloadHash: string;
    amzDate: string;
    headers: Record<string, string>;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    service: string;
}): string {
    const names = Object.keys(params.headers)
        .map((name) => name.toLowerCase())
        .sort();
    const canonicalHeaders = names
        .map((name) => `${name}:${params.headers[name].trim()}\n`)
        .join("");
    const signedHeaders = names.join(";");
    const canonicalRequest = [
        params.method,
        params.path,
        params.query || "",
        canonicalHeaders,
        signedHeaders,
        params.payloadHash
    ].join("\n");

    const date = params.amzDate.slice(0, 8);
    const scope = `${date}/${params.region}/${params.service}/aws4_request`;
    const stringToSign = [
        "AWS4-HMAC-SHA256",
        params.amzDate,
        scope,
        sha256Hex(canonicalRequest)
    ].join("\n");

    const key = [date, params.region, params.service, "aws4_request"].reduce(
        (previous, part) => hmac(previous, part),
        Buffer.from(`AWS4${params.secretAccessKey}`)
    );
    const signature = crypto
        .createHmac("sha256", key)
        .update(stringToSign)
        .digest("hex");

    return `AWS4-HMAC-SHA256 Credential=${params.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function encodeKey(key: string): string {
    return key
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/");
}

async function request(
    method: "PUT" | "GET" | "DELETE" | "HEAD",
    key: string,
    body?: Buffer,
    contentType?: string,
    query?: string
): Promise<Response> {
    const config = objectStorageConfig();

    if (!config) {
        throw new Error(
            "R2 no está configurado. Define R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID y R2_SECRET_ACCESS_KEY."
        );
    }

    const host = `${config.accountId}.r2.cloudflarestorage.com`;
    const path = `/${config.bucket}/${encodeKey(key)}`;
    const payload = body ?? Buffer.alloc(0);
    const payloadHash = sha256Hex(payload);
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const headers: Record<string, string> = {
        host,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate
    };

    if (contentType) {
        headers["content-type"] = contentType;
    }

    const authorization = signRequest({
        method,
        host,
        path,
        query,
        payloadHash,
        amzDate,
        headers,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        region: "auto",
        service: "s3"
    });

    return fetch(`https://${host}${path}${query ? `?${query}` : ""}`, {
        method,
        headers: { ...headers, authorization },
        /** `Uint8Array` es lo que acepta `fetch`; `Buffer` no encaja en el tipo. */
        body: method === "PUT" ? new Uint8Array(payload) : undefined
    });
}

export async function putObject(
    key: string,
    body: Buffer,
    contentType = "application/octet-stream"
): Promise<void> {
    const response = await request("PUT", key, body, contentType);

    if (!response.ok) {
        throw new Error(
            `R2 rechazó la subida (${response.status}): ${await response.text()}`
        );
    }
}

export async function getObject(key: string): Promise<Buffer> {
    const response = await request("GET", key);

    if (!response.ok) {
        throw new Error(`R2 rechazó la descarga (${response.status}).`);
    }

    return Buffer.from(await response.arrayBuffer());
}

export async function deleteObject(key: string): Promise<void> {
    const response = await request("DELETE", key);

    if (!response.ok && response.status !== 404) {
        throw new Error(`R2 rechazó el borrado (${response.status}).`);
    }
}

export type StorageSummary = {
    bucket: string;
    objects: number;
    bytes: number;
    lastModified: string | null;
};

/**
 * Cuenta y suma los objetos del bucket (ListObjectsV2, paginado).
 *
 * El bucket es pequeño (respaldos y adjuntos de una operación), pero se pone un
 * tope de 50 mil objetos para no colgar el panel si algún día crece.
 */
export async function storageSummary(): Promise<StorageSummary | null> {
    const config = objectStorageConfig();

    if (!config) {
        return null;
    }

    let objects = 0;
    let bytes = 0;
    let lastModified: string | null = null;
    let token: string | undefined;
    let pages = 0;

    while (pages < 50) {
        const query = [
            "list-type=2",
            "max-keys=1000",
            token
                ? `continuation-token=${encodeURIComponent(token)}`
                : ""
        ]
            .filter(Boolean)
            .sort()
            .join("&");
        const response = await request("GET", "", undefined, undefined, query);

        if (!response.ok) {
            throw new Error(`R2 rechazó el listado (${response.status}).`);
        }

        const xml = await response.text();

        for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
            const block = match[1];
            const size = Number(/<Size>(\d+)<\/Size>/.exec(block)?.[1] || 0);
            const modified = /<LastModified>([^<]+)<\/LastModified>/.exec(block)?.[1];

            objects += 1;
            bytes += Number.isFinite(size) ? size : 0;

            if (modified && (!lastModified || modified > lastModified)) {
                lastModified = modified;
            }
        }

        const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
        token = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1];
        pages += 1;

        if (!truncated || !token) {
            break;
        }
    }

    return { bucket: config.bucket, objects, bytes, lastModified };
}

/**
 * Prueba de extremo a extremo: sube un archivo diminuto, lo lee y lo borra.
 *
 * Sirve para saber *por qué* falla R2 sin adivinar: el mensaje de Cloudflare
 * es el que se muestra en el panel.
 */
export async function probeObjectStorage(): Promise<{
    ok: boolean;
    bucket: string;
    host: string;
    /** Huella de la llave: sirve para saber si Railway usa la nueva. */
    keyFingerprint: string;
    latencyMs: number;
    error: string | null;
}> {
    const config = objectStorageConfig();
    const started = Date.now();
    const fingerprint = config
        ? crypto
              .createHash("sha256")
              .update(config.accessKeyId)
              .digest("hex")
              .slice(0, 10)
        : "";

    if (!config) {
        return {
            ok: false,
            bucket: process.env.R2_BUCKET || "",
            host: "",
            keyFingerprint: fingerprint,
            latencyMs: 0,
            error:
                "Faltan variables: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID o R2_SECRET_ACCESS_KEY."
        };
    }

    const host = `${config.accountId}.r2.cloudflarestorage.com`;

    try {
        const key = `_diagnostico/prueba-${Date.now()}.txt`;
        const body = Buffer.from("prueba de Margarita", "utf8");

        await putObject(key, body, "text/plain");
        const downloaded = await getObject(key);

        if (downloaded.toString("utf8") !== body.toString("utf8")) {
            throw new Error("El archivo subió, pero se leyó distinto.");
        }

        await deleteObject(key);

        return {
            ok: true,
            bucket: config.bucket,
            host,
            keyFingerprint: fingerprint,
            latencyMs: Date.now() - started,
            error: null
        };
    } catch (error) {
        return {
            ok: false,
            bucket: config.bucket,
            host,
            keyFingerprint: fingerprint,
            latencyMs: Date.now() - started,
            error: error instanceof Error ? error.message : "Error desconocido"
        };
    }
}
