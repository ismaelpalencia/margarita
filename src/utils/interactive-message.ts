/**
 * Mensajes con botones dentro de la ventana de 24 horas.
 *
 * Meta acepta como máximo **tres** respuestas rápidas, con títulos de **20**
 * caracteres y un identificador por botón (lo que devuelve el webhook cuando el
 * cliente toca). Se valida aquí, antes de llamar a la API, para que el error se
 * vea en el panel y no como un 400 de Meta.
 */

export type InteractiveButton = {
    id: string;
    title: string;
};

export type InteractiveButtonMessage = {
    body: string;
    footer: string | null;
    buttons: InteractiveButton[];
};

export const MAX_BUTTONS = 3;
export const MAX_BUTTON_TITLE = 20;
export const MAX_BODY = 1024;
export const MAX_FOOTER = 60;

export class InteractiveMessageError extends Error {}

function buttonId(title: string, index: number): string {
    const slug = title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);

    return slug || `OPCION_${index + 1}`;
}

/**
 * Toma los títulos que escribió la persona y devuelve el mensaje listo.
 * Lanza `InteractiveMessageError` con un texto que se puede mostrar tal cual.
 */
export function buildInteractiveButtons(input: {
    body: string | null | undefined;
    footer?: string | null;
    titles: Array<string | null | undefined>;
}): InteractiveButtonMessage {
    const body = (input.body || "").trim();
    const footer = (input.footer || "").trim();

    if (!body) {
        throw new InteractiveMessageError("Escribe el texto del mensaje.");
    }

    if (body.length > MAX_BODY) {
        throw new InteractiveMessageError(
            `El texto no puede pasar de ${MAX_BODY} caracteres.`
        );
    }

    if (footer.length > MAX_FOOTER) {
        throw new InteractiveMessageError(
            `El pie no puede pasar de ${MAX_FOOTER} caracteres.`
        );
    }

    const titles = input.titles
        .map((title) => (title || "").trim())
        .filter((title) => title !== "");

    if (titles.length === 0) {
        throw new InteractiveMessageError("Agrega al menos un botón.");
    }

    if (titles.length > MAX_BUTTONS) {
        throw new InteractiveMessageError(
            `WhatsApp permite hasta ${MAX_BUTTONS} botones.`
        );
    }

    const buttons = titles.map((title, index) => {
        if (title.length > MAX_BUTTON_TITLE) {
            throw new InteractiveMessageError(
                `El botón «${title}» pasa de ${MAX_BUTTON_TITLE} caracteres.`
            );
        }

        return { id: buttonId(title, index), title };
    });

    const ids = new Set(buttons.map((button) => button.id));

    if (ids.size !== buttons.length) {
        throw new InteractiveMessageError(
            "Dos botones quedaron con el mismo identificador; cambia uno."
        );
    }

    return { body, footer: footer || null, buttons };
}

/** Cuerpo que se manda a la Graph API. */
export function interactivePayload(params: {
    to: string;
    message: InteractiveButtonMessage;
}) {
    return {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.to,
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: params.message.body },
            ...(params.message.footer
                ? { footer: { text: params.message.footer } }
                : {}),
            action: {
                buttons: params.message.buttons.map((button) => ({
                    type: "reply",
                    reply: { id: button.id, title: button.title }
                }))
            }
        }
    };
}
/**
 * Mensajes con lista (menú de hasta 10 opciones en una sección).
 *
 * Meta acepta como máximo **10 filas**, con título de **24** caracteres y
 * descripción de **72**. El botón que abre la lista tiene **20** caracteres.
 * Se valida antes de llamar a la API para que el motivo se vea en el panel.
 */
export type InteractiveListRow = {
    id: string;
    title: string;
    description: string | null;
};

export type InteractiveListMessage = {
    body: string;
    footer: string | null;
    buttonLabel: string;
    sectionTitle: string;
    rows: InteractiveListRow[];
};

export const MAX_LIST_ROWS = 10;
export const MAX_LIST_TITLE = 24;
export const MAX_LIST_DESCRIPTION = 72;
export const MAX_LIST_BUTTON = 20;
export const MAX_LIST_SECTION = 24;

/**
 * Arma la lista a partir de las filas del formulario. Las filas sin título se
 * ignoran; una fila con descripción pero sin título también se ignora.
 */
export function buildInteractiveList(input: {
    body: string | null | undefined;
    footer?: string | null;
    buttonLabel: string | null | undefined;
    sectionTitle?: string | null;
    rows: Array<{
        title: string | null | undefined;
        description?: string | null;
        id?: string | null;
    }>;
}): InteractiveListMessage {
    const body = (input.body || "").trim();
    const footer = (input.footer || "").trim();
    const buttonLabel = (input.buttonLabel || "").trim();
    const sectionTitle = (input.sectionTitle || "").trim() || "Opciones";

    if (!body) {
        throw new InteractiveMessageError("Escribe el texto del mensaje.");
    }

    if (body.length > MAX_BODY) {
        throw new InteractiveMessageError(
            `El texto no puede pasar de ${MAX_BODY} caracteres.`
        );
    }

    if (footer.length > MAX_FOOTER) {
        throw new InteractiveMessageError(
            `El pie no puede pasar de ${MAX_FOOTER} caracteres.`
        );
    }

    if (!buttonLabel) {
        throw new InteractiveMessageError("Escribe el texto del botón que abre la lista.");
    }

    if (buttonLabel.length > MAX_LIST_BUTTON) {
        throw new InteractiveMessageError(
            `El botón que abre la lista no puede pasar de ${MAX_LIST_BUTTON} caracteres.`
        );
    }

    if (sectionTitle.length > MAX_LIST_SECTION) {
        throw new InteractiveMessageError(
            `El título de la sección no puede pasar de ${MAX_LIST_SECTION} caracteres.`
        );
    }

    const rows = input.rows
        .map((row) => ({
            title: (row.title || "").trim(),
            description: (row.description || "").trim(),
            id: (row.id || "").trim()
        }))
        .filter((row) => row.title !== "");

    if (rows.length === 0) {
        throw new InteractiveMessageError("Agrega al menos una opción.");
    }

    if (rows.length > MAX_LIST_ROWS) {
        throw new InteractiveMessageError(
            `WhatsApp permite hasta ${MAX_LIST_ROWS} opciones por lista.`
        );
    }

    const built = rows.map((row, index) => {
        if (row.title.length > MAX_LIST_TITLE) {
            throw new InteractiveMessageError(
                `La opción «${row.title}» pasa de ${MAX_LIST_TITLE} caracteres.`
            );
        }

        if (row.description.length > MAX_LIST_DESCRIPTION) {
            throw new InteractiveMessageError(
                `La descripción de «${row.title}» pasa de ${MAX_LIST_DESCRIPTION} caracteres.`
            );
        }

        return {
            id: row.id ? row.id.slice(0, 200) : listRowId(row.title, index),
            title: row.title,
            description: row.description || null
        };
    });

    const ids = new Set(built.map((row) => row.id));

    if (ids.size !== built.length) {
        throw new InteractiveMessageError(
            "Dos opciones quedaron con el mismo identificador; cambia una."
        );
    }

    return { body, footer: footer || null, buttonLabel, sectionTitle, rows: built };
}

function listRowId(title: string, index: number): string {
    return buttonId(title, index);
}

/** Cuerpo que se manda a la Graph API para una lista. */
export function interactiveListPayload(params: {
    to: string;
    message: InteractiveListMessage;
}) {
    return {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.to,
        type: "interactive",
        interactive: {
            type: "list",
            body: { text: params.message.body },
            ...(params.message.footer
                ? { footer: { text: params.message.footer } }
                : {}),
            action: {
                button: params.message.buttonLabel,
                sections: [
                    {
                        title: params.message.sectionTitle,
                        rows: params.message.rows.map((row) => ({
                            id: row.id,
                            title: row.title,
                            ...(row.description
                                ? { description: row.description }
                                : {})
                        }))
                    }
                ]
            }
        }
    };
}

