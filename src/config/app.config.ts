import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

import { resolveAppUrl } from "../utils/url";
import { parseOptOutKeywords } from "../utils/opt-out";

dotenv.config();

/**
 * URL pública de la instalación.
 *
 * Si no hay `APP_URL`, se usa el dominio público que Railway expone en
 * `RAILWAY_PUBLIC_DOMAIN`. En una instalación recién creada desde la
 * plantilla nadie ha configurado nada todavía, y sin este respaldo la
 * validación de origen (CSRF) quedaría desactivada y el webhook aparecería
 * incompleto: era el error número uno del alta manual.
 */
const resolvedAppUrl = resolveAppUrl({
    APP_URL: process.env.APP_URL,
    RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN
});

const appUrl = resolvedAppUrl.url;

/**
 * Dominios donde vive la **página de venta** (la landing), separados por
 * coma. En cualquier otro dominio —los subdominios de cada operación, tipo
 * `palencia.margaritaapp.org`— la raíz manda al inicio de sesión en lugar de
 * mostrar la oferta.
 *
 * Si no se define, la aplicación se comporta como antes y sirve la landing en
 * su propia raíz: así una instalación suelta (o las pruebas) sigue
 * funcionando sin configurar nada.
 */
const productDomains = (process.env.PRODUCT_DOMAIN || "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

if (resolvedAppUrl.source === "RAILWAY_PUBLIC_DOMAIN") {
    console.warn(
        `[config] APP_URL no está definida: se usa el dominio público de Railway (${appUrl.url}). ` +
            "Puedes fijarla como variable para no depender de él."
    );
}

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

/**
 * ¿Este host sirve la página de venta?
 *
 * Sin `PRODUCT_DOMAIN` configurado se responde que sí, que es el
 * comportamiento de siempre: una instalación sola (o las pruebas) sirve la
 * landing en su raíz. Con la variable puesta, sólo la sirven esos dominios; los
 * subdominios de cada operación mandan al inicio de sesión.
 */
export function servesLanding(
    host: string,
    domains: string[] = productDomains
): boolean {
    if (domains.length === 0) {
        return true;
    }

    const clean = host.split(":")[0].trim().toLowerCase();

    return domains.includes(clean);
}

export const appConfig = {
    name: process.env.APP_NAME || "Margarita",
    version: process.env.APP_VERSION?.trim() || readPackageVersion(),
    /** Railway expone el commit desplegado en esta variable. */
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.trim().slice(0, 7) || "",
    appUrl: appUrl.url,
    productDomains,
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
     * Intentos de acceso permitidos por IP cada 15 minutos.
     *
     * Es configurable porque las pruebas de integración entran muchas veces
     * desde la misma IP —todas salen de 127.0.0.1— y el tope de producción
     * terminaba tumbando la propia suite con un 429.
     */
    loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10,

    /**
     * Tope de acciones **por usuario** cada 15 minutos en el panel.
     *
     * El anterior era por IP: quince agentes en la misma oficina compartían el
     * cupo y los últimos del día recibían 429. Ahora cada persona tiene el
     * suyo, y el límite por IP queda como defensa de borde, mucho más alto.
     */
    panelRateLimitMax: Number(process.env.PANEL_RATE_LIMIT_MAX) || 300,
    panelRateLimitWindowMinutes:
        Number(process.env.PANEL_RATE_LIMIT_WINDOW_MINUTES) || 15,

    /**
     * Tramo de mensajes de **servicio** gratis por número al mes y tarifas con
     * las que se estima el costo. WhatsApp cobra aparte las plantillas; por eso
     * hay tres tarifas. Se configuran porque Meta cambia precios por país.
     */
    serviceFreeMessages: Number(process.env.SERVICE_FREE_MESSAGES) || 1000,
    serviceMessageRate: Number(process.env.SERVICE_MESSAGE_RATE) || 0.05,
    utilityTemplateRate: Number(process.env.UTILITY_TEMPLATE_RATE) || 0.03,
    marketingTemplateRate: Number(process.env.MARKETING_TEMPLATE_RATE) || 0.08,
    usageCurrency: process.env.USAGE_CURRENCY?.trim() || "USD",
    /** Porcentaje del tramo a partir del cual se avisa. */
    usageAlertPercent: Number(process.env.USAGE_ALERT_PERCENT) || 80,

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
    /**
     * Contacto comercial de la página pública: el número en dígitos (con lada
     * país, que es lo que necesita wa.me) y el mismo número como se muestra.
     */
    supportWhatsapp:
        process.env.SUPPORT_WHATSAPP?.replace(/\D/g, "") || "525538783682",
    /**
     * Contacto comercial y de privacidad de la página pública. Por omisión es
     * el del producto; cada instalación puede poner el suyo con
     * `SUPPORT_EMAIL` (y es el correo al que se mandan las solicitudes de
     * datos del aviso de privacidad y las valoraciones de los clientes).
     */
    supportEmail:
        process.env.SUPPORT_EMAIL?.trim() || "contacto@margaritaapp.org",
    supportWhatsappDisplay:
        process.env.SUPPORT_WHATSAPP_DISPLAY?.trim() || "55 3878 3682",
    setupServicePrice:
        process.env.SETUP_SERVICE_PRICE?.trim() ||
        "se cotiza aparte",

    /**
     * La oferta comercial, tal como aparece en la página pública. Se escribe
     * ya formateada ("$1,500.00 MXN") porque es un texto que lee el cliente:
     * el formato es decisión comercial, no del navegador.
     *
     * El modelo es **mes con mes**: la instalación (que se paga junto con el
     * primer mes) y, de ahí en adelante, la mensualidad. Hay una oferta de
     * lanzamiento para los primeros clientes, con precio de lista y de oferta,
     * y una fecha de vigencia: al pasar esa fecha la página deja de anunciarla
     * sola, sin tocar código.
     *
     * Los precios van **más IVA**, como el resto de la propuesta.
     */
    installPrice: process.env.INSTALL_PRICE?.trim() || "$4,900.00 MXN",
    /** Paquete A: instalación + conexión con Meta. */
    installPriceWithMeta:
        process.env.INSTALL_PRICE_WITH_META?.trim() ||
        process.env.SETUP_BUNDLE_PRICE?.trim() ||
        "$3,500.00 MXN",
    installPricePromo:
        process.env.INSTALL_PRICE_PROMO?.trim() || "$2,500.00 MXN",
    installPromoLabel:
        process.env.INSTALL_PROMO_LABEL?.trim() ||
        "Precio de instalación vigente",
    /** Hasta cuándo vale la oferta. Pasada la fecha, se deja de anunciar. */
    installPromoUntil:
        process.env.INSTALL_PROMO_UNTIL?.trim() || "2026-12-31",
    /**
     * Lugares que quedan de la oferta de lanzamiento.
     *
     * Se lleva a mano (la app no vende): al llegar a 0, la página deja de
     * anunciar el precio de captación y muestra el de lista, sin tocar HTML.
     */
    installPromoSpotsLeft:
        process.env.INSTALL_PROMO_SPOTS_LEFT !== undefined
            ? Number(process.env.INSTALL_PROMO_SPOTS_LEFT)
            : 3,
    installMonthlyPrice:
        process.env.INSTALL_MONTHLY_PRICE?.trim() || "$699.00 MXN",
    installMonthlyListPrice:
        process.env.INSTALL_MONTHLY_LIST_PRICE?.trim() || "$1,490.00 MXN",
    /**
     * Mensualidad con compromiso opcional. No hay mínimo obligatorio: el primer
     * mes es un piloto pagado y, al día 30, el cliente decide si sigue.
     */
    monthlyCommit3:
        process.env.MONTHLY_3?.trim() ||
        process.env.MONTHLY_COMMIT_3?.trim() ||
        "$649.00 MXN",
    monthlyCommit6:
        process.env.MONTHLY_6?.trim() ||
        process.env.MONTHLY_COMMIT_6?.trim() ||
        "$599.00 MXN",
    monthlyCommit12:
        process.env.MONTHLY_12?.trim() ||
        process.env.MONTHLY_COMMIT_12?.trim() ||
        "$549.00 MXN",
    /** Ahorro contra el precio de lista, para las tarjetas de la landing. */
    installSavingWithMeta:
        process.env.INSTALL_SAVING_WITH_META?.trim() || "$1,400.00 MXN",
    installSavingBasic:
        process.env.INSTALL_SAVING_BASIC?.trim() || "$2,400.00 MXN",
    pilotDays: Number(process.env.PILOT_DAYS) || 30,


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
    /** `local` (disco) o `r2` (Cloudflare). */
    mediaStorage: (process.env.MEDIA_STORAGE || "local").trim().toLowerCase(),

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

