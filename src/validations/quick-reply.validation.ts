import { z } from "zod";

const titleField = z.string().trim().min(2, "El título debe tener al menos 2 caracteres.").max(60, "El título no puede superar 60 caracteres.");
const textBody = z.string().trim().min(2, "La respuesta no puede estar vacía.").max(2000, "El texto no puede superar 2000 caracteres.");
const interactiveBody = z.string().trim().min(1, "Escribe el texto del mensaje.").max(1024, "El texto no puede superar 1024 caracteres.");
const footerField = z.string().trim().max(60, "El pie no puede superar 60 caracteres.").optional().default("");

const textReplySchema = z.object({ type: z.literal("TEXT").default("TEXT"), title: titleField, body: textBody });
const buttonsReplySchema = z.object({
    type: z.literal("BUTTONS"), title: titleField, body: interactiveBody, footer: footerField,
    buttons: z.array(z.string().trim().min(1, "Cada botón necesita un texto.").max(20, "Cada botón admite hasta 20 caracteres.")).min(1, "Agrega al menos un botón.").max(3, "WhatsApp permite hasta 3 botones.")
}).superRefine((reply, context) => {
    const ids = reply.buttons.map((button) => button.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "OPCION");
    if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["buttons"], message: "Dos botones generan el mismo identificador; cambia sus textos." });
});
const listReplySchema = z.object({
    type: z.literal("LIST"), title: titleField, body: interactiveBody, footer: footerField,
    buttonLabel: z.string().trim().min(1, "Escribe el texto del botón que abre la lista.").max(20, "El botón de la lista admite hasta 20 caracteres."),
    sectionTitle: z.string().trim().max(24, "El título de sección admite hasta 24 caracteres.").optional().default("Opciones"),
    rows: z.array(z.object({
        title: z.string().trim().min(1, "Cada opción necesita un texto.").max(24, "Cada opción admite hasta 24 caracteres."),
        description: z.string().trim().max(72, "La descripción admite hasta 72 caracteres.").optional().default("")
    })).min(1, "Agrega al menos una opción.").max(10, "WhatsApp permite hasta 10 opciones.")
}).superRefine((reply, context) => {
    const ids = reply.rows.map((row) => row.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "OPCION");
    if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["rows"], message: "Dos opciones generan el mismo identificador; cambia sus textos." });
});

export const createQuickReplySchema = z.union([textReplySchema, buttonsReplySchema, listReplySchema]);
export const updateQuickReplySchema = createQuickReplySchema;

export type CreateQuickReplyInput = z.infer<typeof createQuickReplySchema>;
export type UpdateQuickReplyInput = z.infer<typeof updateQuickReplySchema>;
