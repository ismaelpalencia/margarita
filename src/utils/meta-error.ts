export type MetaError = {
    code: string;
    subcode: string | null;
    title: string | null;
    message: string;
    details: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
    if (typeof value === "string" && value.trim() !== "") {
        return value.trim();
    }

    if (typeof value === "number") {
        return String(value);
    }

    return null;
}

function coerceError(candidate: unknown): MetaError | null {
    if (!isRecord(candidate)) {
        return null;
    }

    const code = text(candidate.code);
    const message = text(candidate.message) || text(candidate.title);

    if (!code && !message) {
        return null;
    }

    const errorData = isRecord(candidate.error_data)
        ? text(candidate.error_data.details)
        : null;

    return {
        code: code || "desconocido",
        subcode: text(candidate.error_subcode),
        title: text(candidate.title),
        message: message || "Meta no dio detalles.",
        details: errorData
    };
}

/**
 * Extrae el error de Meta de cualquiera de las formas en que lo guarda
 * la aplicación: la respuesta de un envío rechazado, el arreglo
 * `errors` de un webhook de estado, o el estado más reciente que quedó
 * anidado dentro del mensaje.
 */
export function extractMetaError(payload: unknown): MetaError | null {
    if (!isRecord(payload)) {
        return null;
    }

    const latestStatus = payload.latestStatusWebhook;

    if (isRecord(latestStatus) && Array.isArray(latestStatus.errors)) {
        const fromStatus = coerceError(latestStatus.errors[0]);

        if (fromStatus) {
            return fromStatus;
        }
    }

    if (Array.isArray(payload.errors)) {
        const direct = coerceError(payload.errors[0]);

        if (direct) {
            return direct;
        }
    }

    if (isRecord(payload.data)) {
        const fromData = coerceError(payload.data.error);

        if (fromData) {
            return fromData;
        }
    }

    if (payload.previousMetaResponse) {
        return extractMetaError(payload.previousMetaResponse);
    }

    return null;
}

const EXPLANATIONS: Record<string, string> = {
    "131042":
        "Problema de pago: la cuenta de WhatsApp Business no tiene un método de pago válido o hay un saldo pendiente.",
    "131026":
        "El mensaje no se pudo entregar: el número no tiene WhatsApp o no puede recibir mensajes.",
    "131047":
        "Fuera de la ventana de 24 horas. Hay que usar una plantilla aprobada para reabrir la conversación.",
    "131051": "Tipo de mensaje no soportado por la API.",
    "131030":
        "El número destino no está en la lista de destinatarios permitidos (la app de Meta sigue en modo desarrollo).",
    "131056":
        "Demasiados mensajes enviados a la misma persona en poco tiempo. Espera antes de reintentar.",
    "130429":
        "Se excedió el límite de velocidad de la API. Conviene enviar más despacio.",
    "133010": "El número no está registrado en la plataforma de WhatsApp.",
    "133016": "La cuenta está en pausa temporal por su calidad.",
    "368": "La cuenta está restringida temporalmente por políticas de Meta.",
    "132000": "La cantidad de variables no coincide con la plantilla.",
    "132001": "La plantilla no existe o no está aprobada en ese idioma.",
    "132005": "El texto de la plantilla fue rechazado por Meta.",
    "132007": "La plantilla fue pausada por Meta.",
    "470": "La conversación se cerró y el mensaje necesita una plantilla para reabrirla."
};

/** Traducción al español de los códigos de error más comunes. */
export function explainMetaError(code: string): string | null {
    return EXPLANATIONS[code] || null;
}

/**
 * Devuelve una frase lista para mostrar o registrar, o null si el
 * payload no contiene ningún error (por ejemplo, un envío correcto).
 */
export function describeMetaError(payload: unknown): string | null {
    const error = extractMetaError(payload);

    if (!error) {
        return null;
    }

    const base = error.title
        ? `${error.title} (${error.code})`
        : `Código ${error.code}`;

    const explanation = explainMetaError(error.code);
    const detail = error.details || error.message;

    return explanation
        ? `${base}: ${explanation} Detalle de Meta: ${detail}`
        : `${base}: ${detail}`;
}
