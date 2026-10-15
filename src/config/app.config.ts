import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

import { normalizeAppUrl } from "../utils/url";
import { parseOptOutKeywords } from "../utils/opt-out";

dotenv.config();

const appUrl = normalizeAppUrl(process.env.APP_URL);

/**
 * Versión en ejecución. Sirve para saber qué está corriendo cada
 * instalación cuando hay varias desplegadas.
 */
function readPackageVersion(): string {
    try {
        const raw = fs.readFileSync(
            path.join(process.cwd(), "package.json"),
            "utf8"
        );

        const parsed = JSON.parse(raw) as { version?: string };

        return parsed.version || "desconocida";
    } catch {
        return "desconocida";
    }
}

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
    version: process.env.APP_VERSION?.trim() || readPackageVersion(),
    /** Railway expone el commit desplegado en esta variable. */
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.trim().slice(0, 7) || "",
    appUrl: appUrl.url,
    port: Number(process.env.PORT) || 3000,
    env: process.env.NODE_ENV || "development",
    timezone: process.env.TIMEZONE || "America/Mexico_City",

    jwtSecret: process.env.JWT_SECRET || "dev_secret_change_me",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    cookieName: process.env.COOKIE_NAME || "margarita_token",

    /**
     * Cookie donde se recuerda con qué número está trabajando el usuario.
     * Es solo una preferencia de sesión, no de seguridad.
     */
    activeNumberCookieName:
        process.env.ACTIVE_NUMBER_COOKIE_NAME || "margarita_number",

    /**
     * App Secret de la app de Meta. Se usa para validar la firma
     * X-Hub-Signature-256 de los webhooks entrantes.
     */
    metaAppSecret: process.env.META_APP_SECRET || "",

    /**
     * Base de la Graph API. Es configurable para poder apuntar a un
     * servidor de prueba en desarrollo; en producción se deja el valor
     * por defecto.
     */
    graphBaseUrl:
        process.env.GRAPH_BASE_URL?.trim().replace(/\/+$/, "") ||
        "https://graph.facebook.com",

    /**
     * Llave para cifrar credenciales de Meta en base de datos (AES-256-GCM).
     * Acepta 64 caracteres hexadecimales o cualquier cadena larga.
     */
    encryptionKey: process.env.ENCRYPTION_KEY || "",

    loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS) || 5,
    loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES) || 15,

    /**
     * Minutos de inactividad tras los cuales la sesión se cierra sola, y
     * cuántos dispositivos puede tener abiertos un usuario a la vez.
     *
     * El tope se aplica al iniciar sesión: si se pasa, se cierra la sesión
     * más vieja. Es preferible a atar la sesión a una IP, que dejaría fuera
     * a cualquiera cuando cambie de red (datos móviles, oficina, casa).
     */
    sessionIdleMinutes: Number(process.env.SESSION_IDLE_MINUTES) || 720,
    maxActiveSessions: Number(process.env.SESSION_MAX_ACTIVE) || 3,

    /**
     * Contacto comercial que se muestra en la página pública. El número va
     * en dígitos con lada país (para wa.me) y el precio del servicio de
     * conexión se escribe tal cual se quiere mostrar.
     */
    supportWhatsapp: process.env.SUPPORT_WHATSAPP?.replace(/\D/g, "") || "",
    supportEmail: process.env.SUPPORT_EMAIL?.trim() || "",
    setupServicePrice:
        process.env.SETUP_SERVICE_PRICE?.trim() ||
        "se cotiza según tu caso",


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
    ,
    /**
     * Palabras que dan de baja a un contacto cuando las escribe un cliente.
     * Varias se separan por coma: `OPT_OUT_KEYWORDS="STOP,BAJA"`.
     */
    optOutKeywords: parseOptOutKeywords(process.env.OPT_OUT_KEYWORDS),

    /**
     * Cuántos intentos sin respuesta hacen que un cliente entre a "sin
     * contestación" en los reportes. No marca nada solo: es el umbral con el
     * que se arma la lista de trabajo.
     */
    outcomeNoAnswerAttempts:
        Number(process.env.OUTCOME_NO_ANSWER_ATTEMPTS) || 3,

    /**
     * Cola de campañas: cada cuánto revisa el worker, cuántos
     * destinatarios procesa por vuelta y cuánto espera entre envíos.
     */
    campaignWorkerIntervalMs:
        Number(process.env.CAMPAIGN_WORKER_INTERVAL_MS) || 5000,
    campaignBatchSize: Number(process.env.CAMPAIGN_BATCH_SIZE) || 10,
    campaignSendIntervalMs:
        Number(process.env.CAMPAIGN_SEND_INTERVAL_MS) || 700,

    /**
     * Respaldos automáticos de la base.
     *
     * Se guardan en un archivo (comprimido y cifrado con `ENCRYPTION_KEY`)
     * dentro de `BACKUP_DIR`. Para que sobrevivan a un deploy en Railway, esa
     * carpeta tiene que ser un Volume.
     */
    backupEnabled: process.env.BACKUP_ENABLED !== "false",
    backupIntervalHours: Number(process.env.BACKUP_INTERVAL_HOURS) || 24,
    backupKeep: Number(process.env.BACKUP_KEEP) || 7,
    /** A partir de esta edad, el panel avisa que el respaldo está viejo. */
    backupMaxAgeHours: Number(process.env.BACKUP_MAX_AGE_HOURS) || 36,
    /**
     * Tope de filas por tabla. Si se rebasa, el respaldo **falla** en lugar de
     * guardar una copia incompleta: un respaldo a medias es peor que no
     * tenerlo, porque nadie se entera hasta que hace falta.
     */
    backupMaxRowsPerTable:
        Number(process.env.BACKUP_MAX_ROWS_PER_TABLE) || 500000,
    backupDir:
        process.env.BACKUP_DIR?.trim() ||
        path.join(
            process.env.MEDIA_STORAGE_DIR?.trim() ||
                path.join(process.cwd(), "uploads", "media"),
            "..",
            "backups"
        )
};

