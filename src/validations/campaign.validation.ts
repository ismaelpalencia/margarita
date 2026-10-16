import { z } from "zod";

const variableField = z
    .string()
    .optional()
    .transform((value) => (value === undefined ? "" : value));

export const createCampaignSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, "El nombre de campaña es obligatorio.")
        .max(120, "El nombre es demasiado largo."),
    templateId: z
        .string()
        .trim()
        .min(1, "Selecciona una plantilla."),
    contactIds: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .transform((value) => {
            if (!value) return [];

            if (Array.isArray(value)) {
                return value.filter((item) => item.trim() !== "");
            }

            return value.trim() !== "" ? [value] : [];
        }),
    variable1: variableField,
    variable2: variableField,
    variable3: variableField,
    /** Valor de la variable del encabezado, si la plantilla la pide. */
    headerVariable: z.string().optional(),
    /** Valor que se pega al final de la URL del botón, si la plantilla lo pide. */
    buttonVariable: z.string().optional()
});

export const createCampaignFromExcelSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, "El nombre de campaña es obligatorio.")
        .max(120, "El nombre es demasiado largo."),
    templateId: z
        .string()
        .trim()
        .min(1, "Selecciona una plantilla."),
    variable1: variableField,
    variable2: variableField,
    variable3: variableField,
    headerVariable: z.string().optional(),
    buttonVariable: z.string().optional()
});


export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export type CreateCampaignFromExcelInput = z.infer<
    typeof createCampaignFromExcelSchema
>;
