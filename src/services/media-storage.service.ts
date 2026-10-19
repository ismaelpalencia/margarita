import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { appConfig } from "../config/app.config";
import {
    deleteObject,
    getObject,
    objectStorageConfig,
    putObject
} from "./object-storage.service";

const MIME_EXTENSIONS: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "audio/aac": ".aac",
    "audio/amr": ".amr",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
    "video/mp4": ".mp4",
    "video/3gpp": ".3gp",
    "application/pdf": ".pdf",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/plain": ".txt",
    "text/csv": ".csv"
};

/** Identificadores que llegan de la base: cuid o similar. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function extensionFromMime(mimeType: string | null | undefined): string {
    if (!mimeType) {
        return "";
    }

    const normalized = mimeType.split(";")[0].trim().toLowerCase();

    return MIME_EXTENSIONS[normalized] || "";
}

/**
 * Deja un nombre seguro para mostrarlo o usarlo en la cabecera de
 * descarga: sin rutas, sin caracteres de control y con longitud acotada.
 */
export function sanitizeFilename(
    value: string | null | undefined,
    fallback = "archivo"
): string {
    if (!value) {
        return fallback;
    }

    const base = path
        /* Se normalizan ambos separadores: los nombres pueden venir de
           Windows aunque el servidor sea Linux. */
        .basename(String(value).replace(/\\/g, "/"))
        .replace(/[\u0000-\u001f<>:"/\\|?*]/g, "")
        .trim();

    if (!base || base === "." || base === "..") {
        return fallback;
    }

    return base.slice(0, 120);
}

/**
 * Ruta relativa dentro de la carpeta de medios. Se guarda relativa para
 * que cambiar de carpeta (o de Volume) no invalide lo ya descargado.
 */
export function buildMediaRelativePath(params: {
    workspaceId: string;
    messageId: string;
    extension: string;
}): string {
    if (!SAFE_ID.test(params.workspaceId) || !SAFE_ID.test(params.messageId)) {
        throw new Error("Identificador inválido para guardar el archivo.");
    }

    const extension = /^\.[A-Za-z0-9]{1,8}$/.test(params.extension)
        ? params.extension.toLowerCase()
        : "";

    return `${params.workspaceId}/${params.messageId}${extension}`;
}

/**
 * Une la ruta relativa con la carpeta base y verifica que el resultado
 * no se salga de ella (protección contra path traversal).
 */
export function resolveMediaPath(
    relativePath: string,
    baseDir = mediaDir()
): string {
    const absolute = path.resolve(baseDir, relativePath);
    const base = path.resolve(baseDir);

    if (absolute !== base && !absolute.startsWith(base + path.sep)) {
        throw new Error("La ruta del archivo queda fuera de la carpeta de medios.");
    }

    return absolute;
}

export function mediaDir(): string {
    return appConfig.mediaStorageDir;
}

export function mediaFileExists(relativePath: string | null): boolean {
    if (!relativePath) {
        return false;
    }

    try {
        return fs.statSync(resolveMediaPath(relativePath)).isFile();
    } catch {
        return false;
    }
}

export function mediaFileSize(relativePath: string): number {
    return fs.statSync(resolveMediaPath(relativePath)).size;
}

export function writeMediaFile(
    relativePath: string,
    contents: Buffer
): void {
    const absolute = resolveMediaPath(relativePath);

    fs.mkdirSync(path.dirname(absolute), {
        recursive: true
    });

    fs.writeFileSync(absolute, contents);
}

export function readMediaStream(relativePath: string) {
    return fs.createReadStream(resolveMediaPath(relativePath));
}

export function deleteMediaFile(relativePath: string): void {
    try {
        fs.unlinkSync(resolveMediaPath(relativePath));
    } catch {
        /* Si ya no existe, no hay nada que hacer. */
    }
}

/** Prefijo dentro del bucket: `media/<workspace>/<mensaje>.ext`. */
export function mediaObjectKey(relativePath: string): string {
    return `media/${relativePath.replace(/^\/+/, "")}`;
}

/**
 * Guarda el archivo en disco y, si R2 está configurado, también en el bucket.
 *
 * La copia en R2 es lo que evita perder los adjuntos cuando el contenedor se
 * reemplaza. Si la subida falla, el archivo local se conserva y el error se
 * registra al leer (no se rompe el envío por un problema de red).
 */
export async function storeMediaFile(
    relativePath: string,
    contents: Buffer
): Promise<void> {
    writeMediaFile(relativePath, contents);

    if (!objectStorageConfig()) {
        return;
    }

    try {
        await putObject(mediaObjectKey(relativePath), contents);
    } catch {
        /* Queda la copia local; en el siguiente acceso se vuelve a intentar. */
    }
}

/**
 * Abre un archivo desde donde esté: disco o R2.
 *
 * Es lo que hace que un adjunto siga disponible después de un despliegue,
 * cuando el contenedor ya no tiene el archivo local.
 */
export async function openStoredMedia(relativePath: string): Promise<{
    stream: NodeJS.ReadableStream;
    size: number;
    source: "local" | "r2";
}> {
    if (mediaFileExists(relativePath)) {
        return {
            stream: readMediaStream(relativePath),
            size: mediaFileSize(relativePath),
            source: "local"
        };
    }

    if (objectStorageConfig()) {
        const buffer = await getObject(mediaObjectKey(relativePath));

        return {
            stream: Readable.from(buffer),
            size: buffer.length,
            source: "r2"
        };
    }

    throw new Error("El archivo no está en disco ni en R2.");
}

/** Borra en los dos lados; si R2 falla, el local ya se borró. */
export async function deleteStoredMedia(relativePath: string): Promise<void> {
    deleteMediaFile(relativePath);

    if (objectStorageConfig()) {
        await deleteObject(mediaObjectKey(relativePath)).catch(() => undefined);
    }
}

/**
 * Borra todos los archivos de un workspace. Se usa al eliminar los datos
 * de una instalación al terminar un contrato.
 */
export function deleteWorkspaceMedia(workspaceId: string): void {
    if (!SAFE_ID.test(workspaceId)) {
        return;
    }

    try {
        fs.rmSync(path.resolve(mediaDir(), workspaceId), {
            recursive: true,
            force: true
        });
    } catch {
        /* Si la carpeta no existe o no se puede borrar, no se detiene el proceso. */
    }
}
