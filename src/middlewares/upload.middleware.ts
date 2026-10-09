import multer from "multer";
import path from "path";
import fs from "fs";

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