/**
 * Ejemplo del Excel de una campaña.
 *
 * La página dice «tu archivo debe tener una columna phone», pero con
 * plantillas de varias variables eso no alcanza: hay que saber cuántas columnas
 * hacen falta y cómo se llaman. Aquí se arma un CSV con los encabezados exactos
 * y una fila de ejemplo, para que la persona lo llene y lo suba tal cual.
 */

export type CampaignExampleShape = {
    /** ¿La plantilla pide una variable en el encabezado? */
    header: boolean;
    /** Cuántas variables pide el cuerpo. */
    body: number;
    /** ¿La plantilla tiene botón con URL variable? */
    url: boolean;
};

export type CampaignExample = {
    columns: string[];
    row: string[];
};

export function campaignExample(shape: CampaignExampleShape): CampaignExample {
    const columns = ["phone", "name"];
    const row = ["5215512345678", "María"];

    for (let index = 1; index <= shape.body; index++) {
        columns.push(`var${index}`);
        row.push(`valor ${index}`);
    }

    if (shape.header) {
        columns.push("encabezado");
        row.push("Dato del encabezado");
    }

    if (shape.url) {
        columns.push("enlace");
        row.push("codigo-123");
    }

    return { columns, row };
}

/** Escapa una celda para CSV (comillas dobles y comas). */
function cell(value: string): string {
    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function campaignExampleCsv(shape: CampaignExampleShape): string {
    const { columns, row } = campaignExample(shape);

    return [columns.map(cell).join(","), row.map(cell).join(",")].join("\n");
}

/**
 * Qué escribir en cada campo de la plantilla para que tome la columna del
 * archivo. Se usa para precargar el formulario: la persona baja el ejemplo, lo
 * llena y no tiene que adivinar la sintaxis.
 */
export function campaignExampleSpecs(shape: CampaignExampleShape): {
    body: string[];
    header: string | null;
    url: string | null;
} {
    const body = Array.from(
        { length: shape.body },
        (_, index) => `{columna:var${index + 1}}`
    );

    return {
        body,
        header: shape.header ? "{columna:encabezado}" : null,
        url: shape.url ? "{columna:enlace}" : null
    };
}
