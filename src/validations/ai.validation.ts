import { z } from "zod";

const booleanField = z.preprocess(
    (value) =>
        value === true ||
        value === "true" ||
        value === "on" ||
        value === "1",
    z.boolean()
);

export const aiSettingsSchema = z.object({
    /** El checkbox no envía nada cuando está apagado. */
    enabled: booleanField,
    mode: z.enum(["OFF", "SUGGEST", "AUTO"]).default("SUGGEST"),
    systemPrompt: z.string().trim().max(4000).optional().default(""),
    tone: z.string().trim().max(80).optional().default(""),
    language: z.string().trim().min(2).max(10).default("es-MX"),
    confidenceMin: z.coerce.number().min(0).max(1).default(0.7),
    maxRepliesPerDay: z.coerce.number().int().min(0).max(1000).default(50),
    handoffKeywords: z.string().trim().max(500).optional().default(""),
    model: z.string().trim().max(80).optional().default("")
});

export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;

const keywordsField = z.string().trim().max(300).optional().default("");
const priorityField = z.coerce.number().int().min(0).max(100).default(0);

export const createKnowledgeEntrySchema = z.object({
    question: z
        .string()
        .trim()
        .min(3, "La pregunta debe tener al menos 3 caracteres.")
        .max(200, "La pregunta no puede superar los 200 caracteres."),
    answer: z
        .string()
        .trim()
        .min(2, "La respuesta no puede estar vacía.")
        .max(4000, "La respuesta no puede superar los 4000 caracteres."),
    keywords: keywordsField,
    priority: priorityField
});

export const updateKnowledgeEntrySchema = createKnowledgeEntrySchema;

export type KnowledgeEntryInput = z.infer<typeof createKnowledgeEntrySchema>;

export const aiTestSchema = z.object({
    question: z
        .string()
        .trim()
        .min(3, "Escribe una pregunta de al menos 3 caracteres.")
        .max(500, "La pregunta de prueba no puede superar los 500 caracteres.")
});

/** «horario, ubicación, precio» → ["horario", "ubicación", "precio"] */
export function splitKeywords(value: string): string[] {
    return value
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean)
        .slice(0, 20);
}
