import multer from "multer";
import path from "path";
import fs from "fs";
import { Request, Response, NextFunction } from "express";

const uploadDir = path.join(process.cwd(), "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, {
        recursive: true
    });
}

export const excelUpload = multer({
    dest: uploadDir,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (_req, file, callback) => {
        const allowedMimeTypes = [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "text/csv",
            "application/csv"
        ];

        const allowedExtensions = [".xlsx", ".xls", ".csv"];

        const extension = path.extname(file.originalname).toLowerCase();

        if (
            allowedMimeTypes.includes(file.mimetype) ||
            allowedExtensions.includes(extension)
        ) {
            callback(null, true);
            return;
        }

        callback(new Error("Solo se permiten archivos Excel o CSV."));
    }
});

/**
 * Archivos que el equipo envía a los clientes (imágenes, video, audio y
 * documentos). Se guardan en un temporal y el servicio los mueve al
 * almacenamiento de medios si el envío procede.
 */
const mediaTmpDir = path.join(process.cwd(), "uploads", "tmp");

if (!fs.existsSync(mediaTmpDir)) {
    fs.mkdirSync(mediaTmpDir, { recursive: true });
}

export const mediaUpload = multer({
    dest: mediaTmpDir,
    limits: {
        /* El límite fino por tipo se valida después; aquí solo se evita
           que un archivo enorme llene el disco. */
        fileSize: 100 * 1024 * 1024,
        files: 1
    }
});

/**
 * Envuelve la subida para que un error de multer (por ejemplo, archivo
 * demasiado grande) termine en un aviso de la interfaz y no en un 500.
 */
export function mediaUploadSingle(
    field: string,
    backTo: (req: Request) => string
) {
    return function (req: Request, res: Response, next: NextFunction) {
        mediaUpload.single(field)(req, res, (error: unknown) => {
            if (error) {
                return res.redirect(`${backTo(req)}?error=media`);
            }

            return next();
        });
    };
}
