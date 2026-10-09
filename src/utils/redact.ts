const SENSITIVE_KEY_PATTERN =
    /(token|secret|password|authorization|appsecret|app_secret|access_token|api_?key|credential)/i;

const REDACTED = "[redactado]";

const MAX_DEPTH = 12;

/**
 * Oculta credenciales dentro de un payload antes de guardarlo en la
 * tabla de logs. Los teléfonos y el contenido de los mensajes se
 * conservan porque son necesarios para operar y depurar.
 */
export function redactSensitive(value: unknown, depth = 0): unknown {
    if (depth > MAX_DEPTH) {
        return "[truncado]";
    }

    if (value === null || value === undefined) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map((item) => redactSensitive(item, depth + 1));
    }

    if (typeof value === "object") {
        const result: Record<string, unknown> = {};

        for (const [key, item] of Object.entries(
            value as Record<string, unknown>
        )) {
            result[key] = SENSITIVE_KEY_PATTERN.test(key)
                ? REDACTED
                : redactSensitive(item, depth + 1);
        }

        return result;
    }

    return value;
}
