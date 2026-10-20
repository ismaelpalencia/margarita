import fs from "node:fs";
import path from "node:path";

import { appConfig } from "../config/app.config";

export type StorageStatus = {
    dir: string;
    exists: boolean;
    writable: boolean;
    /** Punto de montaje que contiene el directorio, si se pudo averiguar. */
    mountPoint: string | null;
    /** `true` cuando el directorio está en un Volume y no en el disco del contenedor. */
    persistent: boolean;
    message: string;
};

/**
 * ¿Este directorio es un punto de montaje?
 *
 * En un contenedor Linux un Volume aparece como un montaje propio en
 * `/proc/self/mountinfo`. Si el directorio de archivos no está ahí, vive en la
 * capa del contenedor y **se borra en cada despliegue**, que es justo lo que no
 * puede pasarle a un cliente.
 *
 * La función recibe el contenido de `mountinfo` para poder probarla sin tocar
 * el sistema.
 */
export function isMountPoint(dir: string, mountInfo: string): boolean {
    const target = path.resolve(dir);

    return mountInfo.split("\n").some((line) => {
        const fields = line.trim().split(" ");

        if (fields.length < 5) {
            return false;
        }

        /** Los espacios dentro del punto de montaje se escapan como `\040`. */
        const mounted = fields[4].replace(/\\([0-7]{3})/g, (_, octal: string) =>
            String.fromCharCode(parseInt(octal, 8))
        );

        const mount = path.resolve(mounted);

        /**
         * La raíz del contenedor no cuenta como volumen. Y una carpeta
         * **dentro** del volumen también es persistente: el volumen se monta
         * en `/data` y los archivos pueden vivir en `/data/media`.
         */
        if (mount === path.parse(mount).root) {
            return false;
        }

        return target === mount || target.startsWith(mount + path.sep);
    });
}

function readMountInfo(): string {
    try {
        return fs.readFileSync("/proc/self/mountinfo", "utf8");
    } catch {
        return "";
    }
}

export function storageStatus(dir: string = appConfig.mediaStorageDir): StorageStatus {
    const resolved = path.resolve(dir);
    const exists = fs.existsSync(resolved);
    let writable = false;

    if (exists) {
        try {
            fs.accessSync(resolved, fs.constants.W_OK);
            writable = true;
        } catch {
            writable = false;
        }
    }

    const mountInfo = readMountInfo();
    const persistent = exists && writable && mountInfo !== "" && isMountPoint(resolved, mountInfo);

    const message = !exists
        ? `No existe la carpeta ${resolved}.`
        : !writable
          ? `La carpeta ${resolved} no permite escribir.`
          : persistent
            ? "Los archivos viven en un volumen: sobreviven a los despliegues."
            : "Los archivos viven en el disco del contenedor: se pierden en cada despliegue. Apunta MEDIA_STORAGE_DIR a un Volume.";

    return {
        dir: resolved,
        exists,
        writable,
        mountPoint: persistent ? resolved : null,
        persistent,
        message
    };
}

/**
 * Crea la carpeta de medios si hace falta.
 *
 * Railway crea el punto de montaje (`/data`), pero no las subcarpetas
 * (`/data/media`). Sin esto, el asistente veía "No existe la carpeta
 * /data/media" aunque el Volume estuviera bien montado.
 *
 * Si el Volume no está montado, la carpeta se crea en la capa del contenedor
 * y `storageStatus` sigue reportando que no es persistente: no se oculta una
 * mala configuración.
 */
export function ensureMediaDirectory(
    dir: string = appConfig.mediaStorageDir
): StorageStatus {
    try {
        fs.mkdirSync(path.resolve(dir), { recursive: true });
    } catch {
        /* El estado de abajo explica si no existe o no se puede escribir. */
    }

    return storageStatus(dir);
}

/**
 * En producción, el alta se detiene si los archivos no van a un Volume.
 *
 * Es una decisión deliberada: activar un cliente sin eso significa que la
 * primera actualización le borra las fotos y documentos de sus conversaciones.
 */
export function storageBlocksSetup(status: StorageStatus = storageStatus()): boolean {
    return appConfig.env === "production" && !status.persistent;
}
