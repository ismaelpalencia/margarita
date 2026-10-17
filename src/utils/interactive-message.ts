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
