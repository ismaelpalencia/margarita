export type VariableContext = {
    name: string | null;
    phone: string;
    columns: Record<string, string>;
};

/**
 * Los valores que se guardan por destinatario y que se mandan a Meta: las
 * variables del cuerpo, la del encabezado y la del botón de enlace.
 */
export type RecipientTemplateValues = {
    body: string[];
    header: string;
    button: string;
};

/**
 * Lee lo guardado en `CampaignRecipient.variables`.
 *
 * Las campañas creadas antes de que existieran el encabezado y el botón
 * guardaban **sólo un arreglo** con las variables del cuerpo. Las nuevas
 * guardan un objeto con las tres partes. Aquí se aceptan las dos formas, en un
 * solo lugar, para que el resto del código no tenga que adivinar cuál es.
 */
export function readRecipientTemplateValues(
    value: unknown
): RecipientTemplateValues {
    if (Array.isArray(value)) {
        return {
            body: value.map(String),
            header: "",
            button: ""
        };
    }

    if (value && typeof value === "object") {
        const stored = value as Record<string, unknown>;

        return {
            body: Array.isArray(stored.body) ? stored.body.map(String) : [],
            header: typeof stored.header === "string" ? stored.header : "",
            button: typeof stored.button === "string" ? stored.button : ""
        };
    }

    return { body: [], header: "", button: "" };
}

export type ResolvedVariables = {
    values: string[];
    /** Referencias a columnas que no existen en el archivo. */
    missingColumns: string[];
};

const COLUMN_PREFIX = "columna:";

/**
 * Normaliza un encabezado o una referencia para compararlos sin
 * distinguir mayúsculas, espacios ni acentos.
 */
export function normalizeHeaderKey(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Resuelve el valor de una variable a partir de una plantilla de texto.
 *
 * Referencias especiales:
 *   {nombre}          nombre del contacto
 *   {telefono}        teléfono del contacto
 *   {columna:Pedido}  valor de esa columna en el archivo
 *
 * Cualquier otra llave se deja tal cual, para que los textos que usan
 * llaves de forma normal (por ejemplo "50% {descuento}") no se rompan.
 */
export function resolveVariableSpec(
    spec: string,
    context: VariableContext
): { value: string; missingColumns: string[] } {
    const missingColumns: string[] = [];

    const value = spec.replace(/\{([^{}]+)\}/g, (match, token: string) => {
        const raw = token.trim();
        const normalized = normalizeHeaderKey(raw);

        if (normalized === "nombre") {
            return context.name?.trim() || "";
        }

        if (normalized === "telefono") {
            return context.phone;
        }

        if (normalized.startsWith(COLUMN_PREFIX)) {
            const columnName = raw.slice(COLUMN_PREFIX.length).trim();
            const found = context.columns[normalizeHeaderKey(columnName)];

            if (found === undefined) {
                missingColumns.push(columnName);
                return "";
            }

            return found;
        }

        return match;
    });

    return { value, missingColumns };
}

export function resolveVariableSpecs(
    specs: string[],
    context: VariableContext
): ResolvedVariables {
    const values: string[] = [];
    const missingColumns: string[] = [];

    for (const spec of specs) {
        const resolved = resolveVariableSpec(spec, context);

        values.push(resolved.value.trim());
        missingColumns.push(...resolved.missingColumns);
    }

    return {
        values,
        missingColumns: [...new Set(missingColumns)]
    };
}

/**
 * Los parámetros que espera la API de Meta deben coincidir en número y
 * orden con las variables de la plantilla: por eso no se filtran los
 * valores vacíos, a diferencia del envío manual.
 */
export function buildOrderedParameters(values: string[]) {
    return values.map((text) => ({
        type: "text",
        text
    }));
}
