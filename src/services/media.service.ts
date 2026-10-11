import axios from "axios";
import { Message, UserRole } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { AuthUser } from "../types/auth";
import { decryptSecret } from "../utils/crypto";
import { describeMetaError } from "../utils/meta-error";
import {
    buildMediaRelativePath,
    extensionFromMime,
    mediaFileExists,
    mediaFileSize,
    readMediaStream,
    sanitizeFilename,
    writeMediaFile
} from "./media-storage.service";
import { LogLevel, LogModule } from "@prisma/client";
import { LogService } from "./log.service";

/** El usuario no puede ver este mensaje. */
export class MediaAccessError extends Error {}

/** El archivo no se pudo obtener (de Meta o del disco). */
export class MediaDownloadError extends Error {}

export type StoredMedia = {
    stream: NodeJS.ReadableStream;
    size: number;
    mimeType: string;
    filename: string;
};

type MetaMediaInfo = {
    url?: string;
    mime_type?: string;
    file_size?: number;
};

function filenameFromPayload(message: Message): string | null {
    const payload = message.metaPayload as Record<string, unknown> | null;
    const document = payload?.document as { filename?: string } | undefined;

    return document?.filename || null;
}

/**
 * Devuelve el mensaje solo si el usuario puede verlo. Un agente únicamente
 * accede a los archivos de las conversaciones asignadas a él.
 */
export async function getAuthorizedMessage(
    user: AuthUser,
    messageId: string
): Promise<Message & { conversation: { assignedUserId: string | null } }> {
    const message = await prisma.message.findFirst({
        where: {
            id: messageId,
            workspaceId: user.workspaceId
        },
        include: {
            conversation: {
                select: {
                    assignedUserId: true
                }
            }
        }
    });

    if (!message) {
        throw new MediaAccessError("Mensaje no encontrado.");
    }

    if (
        user.role === UserRole.AGENT &&
        message.conversation.assignedUserId !== user.id
    ) {
        throw new MediaAccessError("No tienes acceso a este archivo.");
    }

    return message;
}

async function downloadFromMeta(message: Message): Promise<{
    buffer: Buffer;
    mimeType: string | null;
    filename: string | null;
}> {
    if (!message.mediaId) {
        throw new MediaDownloadError("Este mensaje no tiene archivo adjunto.");
    }

    const account = await prisma.whatsAppAccount.findUnique({
        where: {
            workspaceId: message.workspaceId
        }
    });

    if (!account) {
        throw new MediaDownloadError(
            "No hay cuenta de WhatsApp configurada para descargar el archivo."
        );
    }

    const accessToken = decryptSecret(account.accessToken);

    const info = await axios.get<MetaMediaInfo>(
        `https://graph.facebook.com/${account.apiVersion}/${message.mediaId}`,
        {
            params: {
                access_token: accessToken
            },
            timeout: 15000
        }
    );

    const mediaUrl = info.data?.url;

    if (!mediaUrl) {
        throw new MediaDownloadError(
            "Meta no devolvió la dirección del archivo."
        );
    }

    const download = await axios.get<ArrayBuffer>(mediaUrl, {
        headers: {
            Authorization: `Bearer ${accessToken}`
        },
        responseType: "arraybuffer",
        timeout: 30000,
        maxContentLength: appConfig.mediaMaxBytes
    });

    const disposition = String(download.headers["content-disposition"] || "");
    const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);

    return {
        buffer: Buffer.from(download.data),
        mimeType: info.data.mime_type || message.mimeType || null,
        filename: match ? decodeURIComponent(match[1]) : null
    };
}

async function recordFailure(message: Message, error: unknown) {
    const detail =
        axios.isAxiosError(error) && error.response?.data
            ? describeMetaError({ data: error.response.data, status: error.response.status }) ||
              error.message
            : error instanceof Error
              ? error.message
              : "Error desconocido";

    await prisma.message
        .update({
            where: {
                id: message.id
            },
            data: {
                mediaDownloadError: detail
            }
        })
        .catch(() => undefined);

    await LogService.create({
        workspaceId: message.workspaceId,
        level: LogLevel.WARN,
        module: LogModule.MESSAGE,
        action: "MEDIA_DOWNLOAD_FAILED",
        message: detail,
        payload: {
            messageId: message.id,
            mediaId: message.mediaId,
            type: message.type
        }
    }).catch(() => undefined);

    return detail;
}

/**
 * Garantiza que el archivo esté en disco y devuelve un stream para
 * servirlo. La descarga desde Meta ocurre la primera vez que alguien abre
 * el archivo: así no se llena el disco con material que nadie mira.
 */
export async function ensureStoredMedia(
    message: Message
): Promise<StoredMedia> {
    if (message.mediaPath && mediaFileExists(message.mediaPath)) {
        return {
            stream: readMediaStream(message.mediaPath),
            size: mediaFileSize(message.mediaPath),
            mimeType: message.mimeType || "application/octet-stream",
            filename: sanitizeFilename(
                message.mediaFilename ||
                    filenameFromPayload(message) ||
                    `archivo-${message.id}`
            )
        };
    }

    try {
        const downloaded = await downloadFromMeta(message);
        const extension = extensionFromMime(downloaded.mimeType);
        const relativePath = buildMediaRelativePath({
            workspaceId: message.workspaceId,
            messageId: message.id,
            extension
        });

        writeMediaFile(relativePath, downloaded.buffer);

        const filename = sanitizeFilename(
            downloaded.filename ||
                filenameFromPayload(message) ||
                `archivo-${message.id}${extension}`
        );

        await prisma.message.update({
            where: {
                id: message.id
            },
            data: {
                mediaPath: relativePath,
                mediaSize: downloaded.buffer.length,
                mediaFilename: filename,
                mediaDownloadedAt: new Date(),
                mediaDownloadError: null,
                mimeType: downloaded.mimeType || message.mimeType
            }
        });

        return {
            stream: readMediaStream(relativePath),
            size: downloaded.buffer.length,
            mimeType: downloaded.mimeType || "application/octet-stream",
            filename
        };
    } catch (error) {
        const detail = await recordFailure(message, error);

        throw new MediaDownloadError(detail);
    }
}

/**
 * Descarga anticipada, para que el archivo esté listo antes de que
 * alguien lo abra. No lanza: un fallo aquí no debe romper el
 * procesamiento del webhook.
 */
export async function prefetchMedia(message: Message): Promise<void> {
    if (message.mediaPath && mediaFileExists(message.mediaPath)) {
        return;
    }

    try {
        await ensureStoredMedia(message);
    } catch {
        /* Queda registrado en mediaDownloadError para reintentarlo al abrir. */
    }
}
