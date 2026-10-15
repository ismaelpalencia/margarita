import zlib from "node:zlib";

import { decryptSecret, encryptSecret, isEncrypted } from "./crypto";

/**
 * Formato del archivo de respaldo.
 *
 * Es un JSON (una copia fiel de las tablas, con los campos tal como están
 * guardados) comprimido con gzip y cifrado con la misma llave de la base.
 *
 * Dos consecuencias que conviene tener presentes:
 *
 * - El archivo **no se puede leer sin `ENCRYPTION_KEY`**. Es la misma custodia
 *   que ya se necesita para los datos vivos: si la llave se pierde, el
 *   respaldo tampoco sirve.
 * - Como se guarda el valor tal cual está en la base, los campos sensibles
 *   siguen cifrados dentro del archivo. Un respaldo robado no expone
 *   teléfonos ni mensajes, ni siquiera parcialmente.
 */

export const BACKUP_FORMAT = "margarita-backup@1";

export type SnapshotPayload = {
    format: string;
    createdAt: string;
    app: string;
    version?: string;
    /** Cuántas filas de cada tabla se guardaron. */
    counts: Record<string, number>;
    /** Nombre de tabla → filas. */
    tables: Record<string, unknown[]>;
};

export function encodeSnapshot(payload: SnapshotPayload): string {
    const json = JSON.stringify(payload);
    const compressed = zlib.gzipSync(Buffer.from(json, "utf8"), {
        level: 9
    });

    return encryptSecret(compressed.toString("base64"));
}

/**
 * Lee un respaldo. Acepta el archivo cifrado (`enc:v1:…`) y también un JSON
 * en claro con el mismo sobre, por si alguien guardó una copia legible.
 */
export function decodeSnapshot(content: string): SnapshotPayload {
    const text = content.trim();

    if (!text) {
        throw new Error("El archivo de respaldo está vacío.");
    }

    const json = isEncrypted(text)
        ? inflate(decryptSecret(text))
        : text;

    let parsed: unknown;

    try {
        parsed = JSON.parse(json);
    } catch {
        throw new Error(
            "El archivo no es un respaldo de Margarita (no se pudo leer el contenido)."
        );
    }

    if (
        !parsed ||
        typeof parsed !== "object" ||
        (parsed as SnapshotPayload).format !== BACKUP_FORMAT ||
        typeof (parsed as SnapshotPayload).tables !== "object"
    ) {
        throw new Error(
            "El archivo no tiene el formato de un respaldo de Margarita."
        );
    }

    return parsed as SnapshotPayload;
}

function inflate(base64: string): string {
    try {
        return zlib.gunzipSync(Buffer.from(base64, "base64")).toString("utf8");
    } catch {
        throw new Error(
            "El respaldo no se pudo descomprimir. ¿Se copió completo y con la misma ENCRYPTION_KEY?"
        );
    }
}

/** Nombre del archivo, ordenable y sin dos puntos (Windows no los acepta). */
export function snapshotFilename(date = new Date(), timezone = "UTC"): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).formatToParts(date);

    const value = (type: string) =>
        parts.find((part) => part.type === type)?.value ?? "00";

    return `margarita-${value("year")}-${value("month")}-${value("day")}-${value("hour")}${value("minute")}.mgb`;
}

export function humanSize(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
