export type CsvCell = string | number | boolean | Date | null | undefined | object;

function formatCell(value: CsvCell): string {
    if (value === null || value === undefined) {
        return "";
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (typeof value === "object") {
        return JSON.stringify(value);
    }

    return String(value);
}

function escapeCell(value: string): string {
    const needsQuotes =
        /[",\n\r]/.test(value) ||
        value !== value.trim() ||
        value.startsWith("=") ||
        value.startsWith("+") ||
        value.startsWith("@");

    if (!needsQuotes) {
        return value;
    }

    return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Convierte filas en CSV. Incluye BOM para que Excel respete los acentos
 * y las tildes al abrir el archivo.
 */
export function toCsv(
    rows: Array<Record<string, CsvCell>>,
    columns: string[]
): string {
    const lines = [columns.map((column) => escapeCell(column)).join(",")];

    for (const row of rows) {
        lines.push(
            columns
                .map((column) => escapeCell(formatCell(row[column])))
                .join(",")
        );
    }

    return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
