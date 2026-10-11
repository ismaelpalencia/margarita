import { MessageType } from "@prisma/client";

/**
 * Límites que aplica Meta por tipo de archivo (en bytes). Se validan
 * antes de subir nada para no gastar la subida y para dar un mensaje
 * claro al usuario.
 */
export const MAX_BYTES_BY_TYPE: Record<string, number> = {
    IMAGE: 5 * 1024 * 1024,
    VIDEO: 16 * 1024 * 1024,
    AUDIO: 16 * 1024 * 1024,
    DOCUMENT: 100 * 1024 * 1024
};

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png"];
const VIDEO_MIME_TYPES = ["video/mp4", "video/3gpp"];
const AUDIO_MIME_TYPES = [
    "audio/aac",
    "audio/amr",
    "audio/mpeg",
    "audio/mp4",
    "audio/ogg"
];
const DOCUMENT_MIME_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv"
];

export type ClassifiedUpload = {
    type: MessageType;
    mimeType: string;
    filename: string;
    maxBytes: number;
};

export type ClassifyResult =
    | { ok: true; value: ClassifiedUpload }
    | { ok: false; reason: string };

export function normalizeMimeType(mimeType: string | null | undefined): string {
    return String(mimeType || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
}

/**
 * Traduce el archivo subido a un tipo de mensaje de WhatsApp. Si el
 * formato no es de los que Meta acepta, devuelve el motivo en español.
 */
export function classifyUpload(params: {
    mimeType: string | null | undefined;
    filename: string;
}): ClassifyResult {
    const mimeType = normalizeMimeType(params.mimeType);

    const type = IMAGE_MIME_TYPES.includes(mimeType)
        ? MessageType.IMAGE
        : VIDEO_MIME_TYPES.includes(mimeType)
          ? MessageType.VIDEO
          : AUDIO_MIME_TYPES.includes(mimeType)
            ? MessageType.AUDIO
            : DOCUMENT_MIME_TYPES.includes(mimeType)
              ? MessageType.DOCUMENT
              : null;

    if (!type) {
        return {
            ok: false,
            reason:
                `El formato ${mimeType || "desconocido"} no se puede enviar por WhatsApp. ` +
                "Acepta imágenes JPG o PNG, video MP4, audio MP3/OGG/AMR, PDF, Word, Excel, PowerPoint o texto."
        };
    }

    return {
        ok: true,
        value: {
            type,
            mimeType,
            filename: params.filename,
            maxBytes: MAX_BYTES_BY_TYPE[type]
        }
    };
}

export function buildMediaMessagePayload(params: {
    to: string;
    type: MessageType;
    mediaId: string;
    caption?: string | null;
    filename?: string | null;
}) {
    const caption = params.caption?.trim() || null;
    const base = {
        messaging_product: "whatsapp",
        to: params.to
    };

    if (params.type === MessageType.IMAGE) {
        return {
            ...base,
            type: "image" as const,
            image: {
                id: params.mediaId,
                ...(caption ? { caption } : {})
            }
        };
    }

    if (params.type === MessageType.VIDEO) {
        return {
            ...base,
            type: "video" as const,
            video: {
                id: params.mediaId,
                ...(caption ? { caption } : {})
            }
        };
    }

    if (params.type === MessageType.AUDIO) {
        /* El audio no admite texto: Meta rechaza `caption` en audio. */
        return {
            ...base,
            type: "audio" as const,
            audio: {
                id: params.mediaId
            }
        };
    }

    return {
        ...base,
        type: "document" as const,
        document: {
            id: params.mediaId,
            ...(params.filename ? { filename: params.filename } : {}),
            ...(caption ? { caption } : {})
        }
    };
}
