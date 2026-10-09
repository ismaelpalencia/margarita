import dotenv from "dotenv";

dotenv.config();

export const appConfig = {
    name: process.env.APP_NAME || "Margarita",
    appUrl: process.env.APP_URL || "http://localhost:3000",
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

    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || "",
    alertCooldownMinutes: Number(process.env.ALERT_COOLDOWN_MINUTES) || 10
};
