type TemplateComponent = {
    type?: string;
    text?: string;
    format?: string;
    url?: string;
    buttons?: Array<{
        type?: string;
        text?: string;
        url?: string;
    }>;
};

export function getTemplateBodyText(components: unknown): string {
    if (!Array.isArray(components)) return "";

    const body = components.find((component) => {
        const item = component as TemplateComponent;
        return item.type === "BODY";
    }) as TemplateComponent | undefined;

    return body?.text || "";
}

/**
 * Texto del encabezado, si la plantilla trae uno de tipo texto.
 *
 * Meta permite **exactamente una** variable en el encabezado; si la plantilla
 * la usa, hay que mandarla al enviar o el envío se rechaza.
 */
export function getTemplateHeaderText(components: unknown): string {
    if (!Array.isArray(components)) return "";

    const header = components.find((component) => {
        const item = component as TemplateComponent;
        return item.type === "HEADER" && (item.format || "TEXT") === "TEXT";
    }) as TemplateComponent | undefined;

    return header?.text || "";
}

/** Los botones de la plantilla, con su tipo y si llevan variable en la URL. */
export function getTemplateButtons(
    components: unknown
): Array<{ type: string; text: string; url: string; hasUrlVariable: boolean }> {
    if (!Array.isArray(components)) return [];

    const holder = components.find((component) => {
        const item = component as TemplateComponent;
        return item.type === "BUTTONS" && Array.isArray(item.buttons);
    }) as TemplateComponent | undefined;

    return (holder?.buttons || []).map((button) => {
        const url = button.url || "";

        return {
            type: (button.type || "").toUpperCase(),
            text: button.text || "",
            url,
            /**
             * La variable del botón de URL va **al final** y sola: Meta no
             * admite otra cosa, así que se detecta por el `{{n}}` del final.
             */
            hasUrlVariable: /{{\s*\d+\s*}}$/.test(url.trim())
        };
    });
}

/** Cuántas variables pide la plantilla en cada componente. */
export function templateVariableShape(components: unknown): {
    body: number;
    header: number;
    url: number;
} {
    const headerText = getTemplateHeaderText(components);
    const urlButton = getTemplateButtons(components).find(
        (button) => button.hasUrlVariable
    );

    return {
        body: countTemplateVariables(components),
        header: /{{\s*\d+\s*}}/.test(headerText) ? 1 : 0,
        url: urlButton ? 1 : 0
    };
}

export type TemplateVariableValues = {
    body: string[];
    header: string;
    button: string;
};

/**
 * Ajusta lo que escribió la persona a lo que la plantilla pide: recorta las
 * variables del cuerpo que sobran (las plantillas suelen pedir menos de tres) y
 * deja vacíos los componentes que la plantilla no usa.
 */
export function normalizeTemplateVariables(
    components: unknown,
    provided: {
        body?: string[];
        header?: string;
        button?: string;
    }
): TemplateVariableValues {
    const shape = templateVariableShape(components);

    return {
        body: (provided.body || []).slice(0, shape.body),
        header: shape.header ? (provided.header || "").trim() : "",
        button: shape.url ? (provided.button || "").trim() : ""
    };
}

/** Qué falta por llenar, con el nombre del componente para poder avisarlo. */
export function missingTemplateVariables(
    components: unknown,
    values: TemplateVariableValues
): string[] {
    const shape = templateVariableShape(components);
    const missing: string[] = [];

    if (shape.body > 0 && values.body.some((value) => value.trim() === "")) {
        missing.push("cuerpo");
    }

    if (shape.header > 0 && values.header === "") {
        missing.push("encabezado");
    }

    if (shape.url > 0 && values.button === "") {
        missing.push("botón de enlace");
    }

    return missing;
}

export function countTemplateVariables(components: unknown): number {
    const bodyText = getTemplateBodyText(components);

    const matches = bodyText.match(/{{\s*\d+\s*}}/g);

    return matches ? matches.length : 0;
}

export function renderTemplatePreview(
    components: unknown,
    variables: string[]
): string {
    let body = getTemplateBodyText(components);

    variables.forEach((value, index) => {
        const position = index + 1;
        const regex = new RegExp(`{{\\s*${position}\\s*}}`, "g");

        body = body.replace(regex, value || `{{${position}}}`);
    });

    return body;
}

export function buildTemplateBodyParameters(variables: string[]) {
    return variables
        .filter((value) => value.trim() !== "")
        .map((value) => ({
            type: "text",
            text: value
        }));
}

/**
 * Payload de un mensaje de plantilla para la API de Meta.
 *
 * Los parámetros del cuerpo deben coincidir en número y orden con las
 * variables de la plantilla: por eso aquí no se filtran los valores
 * vacíos (a diferencia de `buildTemplateBodyParameters`, que se usa en
 * el envío manual después de validar que ninguno esté vacío).
 *
 * Desde que se admiten plantillas con botones, el envío puede llevar **tres
 * componentes**: el encabezado (una sola variable), el cuerpo y el botón de
 * enlace (una variable al final de la URL). Cada uno se manda sólo si la
 * plantilla lo pide: un componente de más hace que Meta rechace el envío.
 */
export function buildTemplateMessagePayload(params: {
    to: string;
    name: string;
    language: string;
    variables: string[];
    /** Valor de la variable del encabezado, si la plantilla la pide. */
    header?: string;
    /** Valor de la variable al final de la URL del botón, si la pide. */
    button?: string;
}) {
    type TextParameter = { type: "text"; text: string };

    type PayloadComponent =
        | { type: "header"; parameters: TextParameter[] }
        | { type: "body"; parameters: TextParameter[] }
        | {
              type: "button";
              sub_type: "url";
              index: string;
              parameters: TextParameter[];
          };

    const components: PayloadComponent[] = [];

    if (params.header && params.header.trim() !== "") {
        components.push({
            type: "header",
            parameters: [{ type: "text", text: params.header }]
        });
    }

    if (params.variables.length > 0) {
        components.push({
            type: "body",
            parameters: params.variables.map((text) => ({
                type: "text",
                text
            }))
        });
    }

    if (params.button && params.button.trim() !== "") {
        components.push({
            type: "button",
            /** En Meta, `url` es un subtipo y el índice va entre comillas. */
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: params.button }]
        });
    }

    return {
        messaging_product: "whatsapp",
        to: params.to,
        type: "template",
        template: {
            name: params.name,
            language: {
                code: params.language
            },
            ...(components.length > 0 ? { components } : {})
        }
    };
}
