import dotenv from "dotenv";
import path from "node:path";

import { normalizeAppUrl } from "../utils/url";

dotenv.config();

const appUrl = normalizeAppUrl(process.env.APP_URL);

if (appUrl.normalized && process.env.APP_URL) {
    console.warn(
        `[config] APP_URL no incluía el esquema ("${process.env.APP_URL}"). Se usará "${appUrl.url}". ` +
            "Ajusta la variable en Railway para evitar sorpresas."
    );
}

if (
    process.env.NODE_ENV === "production" &&
    /localhost|127\.0\.0\.1/.test(appUrl.url)
) {
    console.warn(
        `[config] APP_URL apunta a "${appUrl.url}" en producción. Configúrala con el dominio público: ` +
            "rompe CORS, la validación de origen y la URL del webhook que se muestra en el panel."
    );
}

const metaAppSecret = process.env.META_APP_SECRET || "";

/**
 * El App Secret real de Meta son 32 caracteres hexadecimales. Un valor
 * corto casi siempre es un relleno, y con él la firma de los webhooks
 * nunca coincide: Meta recibe 401 en cada intento y los mensajes se
 * quedan sin actualizar de estado.
 */
if (metaAppSecret && !/^[0-9a-f]{32}$/i.test(metaAppSecret)) {
    console.warn(
        `[config] META_APP_SECRET no parece el App Secret de Meta (se esperan 32 caracteres hexadecimales y tiene ${metaAppSecret.length}). ` +
            "Si es un valor de relleno, la validación de firma rechazará todos los webhooks."
    );
}

const encryptionKey = process.env.ENCRYPTION_KEY || "";

if (encryptionKey && encryptionKey.length < 32) {
    console.warn(
        `[config] ENCRYPTION_KEY es muy corta (${encryptionKey.length} caracteres). ` +
            "Usa 64 caracteres hexadecimales: `npm run secrets:generate`."
    );
}

export const appConfig = {
    name: process.env.APP_NAME || "Margarita",
    appUrl: appUrl.url,
    port: Number(process.env.PORT) || 3000,
    env: process.env.NODE_ENV || "development",
    timezone: process.env.TIMEZONE || "America/Mexico_City",

    jwtSecret: process.env.JWT_SECRET || "dev_secret_change_me",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    cookieName: process.env.COOKIE_NAME || "margarita_token",

    /**
     * App Secret de la app de Meta. Se usa para validar la firma
     * X-Hub-Signature-256 de los webhooks entrantes.
     */
    metaAppSecret: process.env.META_APP_SECRET || "",

    /**
     * Llave para cifrar credenciales de Meta en base de datos (AES-256-GCM).
     * Acepta 64 caracteres hexadecimales o cualquier cadena larga.
     */
    encryptionKey: process.env.ENCRYPTION_KEY || "",

    loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS) || 5,
    loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES) || 15,

    logRetentionDays: Number(process.env.LOG_RETENTION_DAYS) || 90,
    webhookEventRetentionDays:
        Number(process.env.WEBHOOK_EVENT_RETENTION_DAYS) || 30,

    webhookQueueEnabled: process.env.WEBHOOK_QUEUE_ENABLED !== "false",
    webhookWorkerIntervalMs:
        Number(process.env.WEBHOOK_WORKER_INTERVAL_MS) || 2000,
    webhookMaxAttempts: Number(process.env.WEBHOOK_MAX_ATTEMPTS) || 5,
    /**
     * Cuánto espera el worker antes de volver a intentar cuando detecta
     * que a la base le faltan migraciones.
     */
    webhookSchemaPauseMs:
        Number(process.env.WEBHOOK_SCHEMA_PAUSE_MS) || 5 * 60 * 1000,

    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || "",
    alertCooldownMinutes: Number(process.env.ALERT_COOLDOWN_MINUTES) || 10,

    /**
     * Carpeta donde se guardan los archivos que envía Meta. En producción
     * conviene apuntarla a un Volume (por ejemplo /data/media), porque el
     * disco de Railway es efímero.
     */
    mediaStorageDir:
        process.env.MEDIA_STORAGE_DIR?.trim() ||
        path.join(process.cwd(), "uploads", "media"),

    /** Tamaño máximo que se descarga de Meta (por defecto 25 MB). */
    mediaMaxBytes: Number(process.env.MEDIA_MAX_BYTES) || 25 * 1024 * 1024
};
