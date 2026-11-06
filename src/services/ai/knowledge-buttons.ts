import {
    buildInteractiveButtons,
    InteractiveButton,
    InteractiveMessageError
} from "../../utils/interactive-message";

/**
 * Convierte los títulos que escribe el administrador en botones válidos.
 * Devuelve null si no hay ninguno. Lanza InteractiveMessageError con un
 * mensaje mostrable si pasa de 3 o de 20 caracteres.
 */
export function parseKnowledgeButtons(
    titles: Array<string | null | undefined>
): InteractiveButton[] | null {
    const clean = titles
        .map((title) => (title || "").trim())
        .filter((title) => title !== "");

    if (clean.length === 0) {
        return null;
    }

    const message = buildInteractiveButtons({
        body: "Respuesta",
        titles: clean
    });

    return message.buttons;
}

export { InteractiveMessageError };
