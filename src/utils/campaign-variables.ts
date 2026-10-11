export type VariableContext = {
    name: string | null;
    phone: string;
    columns: Record<string, string>;
};

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
