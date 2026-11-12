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

/**
 * Exporta un lead por fila. Los campos del flujo se abren en columnas
 * `dato_<campo>` en vez de quedar todos dentro de un JSON.
 */
export function buildLeadsCsv(leads: LeadCsvRow[]): string {
    const fieldKeys = Array.from(
        new Set(
            leads.flatMap((lead) => Object.keys(fieldObject(lead.fields)))
        )
    ).sort((a, b) => a.localeCompare(b, "es"));

    const headers = [
        "id",
        "email",
        "nombre",
        "telefono",
        "interes",
        ...fieldKeys.map((key) => `dato_${key}`),
        "origen",
        "estado",
        "creado"
    ];

    const rows = [headers.map((header) => csvCell(header)).join(",")];

    for (const lead of leads) {
        const fields = fieldObject(lead.fields);
        const values = [
            lead.id,
            lead.email,
            lead.name,
            lead.phone,
            lead.interest,
            ...fieldKeys.map((key) => fieldValue(fields[key])),
            lead.source,
            lead.status,
            lead.createdAt.toISOString()
        ];

        rows.push(values.map((value) => csvCell(value)).join(","));
    }

    return "\uFEFF" + rows.join("\r\n");
}
