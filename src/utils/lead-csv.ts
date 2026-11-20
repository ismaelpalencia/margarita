export type LeadCsvRow = {
    id: string;
    email: string | null;
    name: string | null;
    phone: string | null;
    interest: string | null;
    fields: unknown;
    source: string;
    status: string;
    createdAt: Date;
};

function csvCell(value: string | null): string {
    if (value == null) {
        return "";
    }

    const escaped = value.replace(/"/g, '""');

    return /[,"\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

function fieldObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function fieldValue(value: unknown): string | null {
    if (value == null) {
        return null;
    }

    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    return JSON.stringify(value);
}

export const LEAD_CSV_COLUMNS = [
    "nombre",
    "telefono",
    "email",
    "interes",
    "origen",
    "estado",
    "creado",
    "id"
] as const;

export type LeadCsvColumn = (typeof LEAD_CSV_COLUMNS)[number];

const COLUMN_VALUES: Record<LeadCsvColumn, (lead: LeadCsvRow) => string | null> = {
    nombre: (lead) => lead.name,
    telefono: (lead) => lead.phone,
    email: (lead) => lead.email,
    interes: (lead) => lead.interest,
    origen: (lead) => lead.source,
    estado: (lead) => lead.status,
    creado: (lead) => lead.createdAt.toISOString(),
    id: (lead) => lead.id
};

/**
 * Exporta un lead por fila. Las columnas base son configurables; los campos
 * del flujo solo se abren si se piden explícitamente.
 */
export function buildLeadsCsv(
    leads: LeadCsvRow[],
    options: {
        columns?: LeadCsvColumn[];
        includeFields?: boolean;
    } = {}
): string {
    const selected = (
        options.columns && options.columns.length
            ? options.columns
            : LEAD_CSV_COLUMNS.filter((column) => column !== "id")
    ).filter((column): column is LeadCsvColumn =>
        (LEAD_CSV_COLUMNS as readonly string[]).includes(column)
    );

    const includeFields = options.includeFields ?? true;

    const fieldKeys = includeFields
        ? Array.from(
              new Set(
                  leads.flatMap((lead) =>
                      Object.keys(fieldObject(lead.fields))
                  )
              )
          ).sort((a, b) => a.localeCompare(b, "es"))
        : [];

    const headers = [
        ...selected,
        ...fieldKeys.map((key) => `dato_${key}`)
    ];

    const rows = [headers.map((header) => csvCell(header)).join(",")];

    for (const lead of leads) {
        const fields = fieldObject(lead.fields);
        const values = [
            ...selected.map((column) => COLUMN_VALUES[column](lead)),
            ...fieldKeys.map((key) => fieldValue(fields[key]))
        ];

        rows.push(values.map((value) => csvCell(value)).join(","));
    }

    return "\uFEFF" + rows.join("\r\n");
}
