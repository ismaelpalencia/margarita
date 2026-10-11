import { Request, Response } from "express";

import {
    ensureStoredMedia,
    getAuthorizedMessage,
    MediaAccessError,
    MediaDownloadError
} from "../services/media.service";
import { getRequiredParam } from "../utils/request";

export class MediaController {
    static async show(req: Request, res: Response) {
        try {
            const messageId = getRequiredParam(req, "id");
            const message = await getAuthorizedMessage(req.user!, messageId);
            const media = await ensureStoredMedia(message);

            res.setHeader(
                "Content-Type",
                media.mimeType || "application/octet-stream"
            );
            res.setHeader("Content-Length", String(media.size));
            /**
             * El contenido de un mensaje no cambia, así que se puede
             * cachear en el navegador y evitar descargas repetidas.
             */
            res.setHeader("Cache-Control", "private, max-age=86400");

            const disposition =
                req.query.download === "1" ? "attachment" : "inline";
            const asciiName = media.filename.replace(/[^\x20-\x7e]/g, "_");

            res.setHeader(
                "Content-Disposition",
                `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(media.filename)}`
            );

            media.stream.pipe(res);

            return;
        } catch (error) {
            if (error instanceof MediaAccessError) {
                return res.status(404).send("Archivo no disponible.");
            }

            if (error instanceof MediaDownloadError) {
                return res
                    .status(502)
                    .send(
                        `No se pudo obtener el archivo. ${error.message}`
                    );
            }

            console.error("Error sirviendo multimedia:", error);

            return res.status(500).send("Error inesperado al servir el archivo.");
        }
    }
}
