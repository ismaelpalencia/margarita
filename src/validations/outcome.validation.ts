import { ContactOutcomeType } from "@prisma/client";
import { z } from "zod";

const optionalText = (max: number) =>
    z
        .string()
        .trim()
        .max(max)
        .optional()
        .transform((value) => (value && value !== "" ? value : undefined));

/** "YYYY-MM-DD", que es lo que manda un `<input type="date">`. */
const optionalDate = z
    .string()
    .trim()
    .optional()
    .transform((value) => (value && value !== "" ? value : undefined))
    .refine(
        (value) => value === undefined || /^\d{4}-\d{2}-\d{2}$/.test(value),
        "La fecha debe tener el formato AAAA-MM-DD."
    );

export const markOutcomeSchema = z.object({
    type: z.nativeEnum(ContactOutcomeType, {
        errorMap: () => ({ message: "Selecciona un resultado." })
    }),
    note: optionalText(500),
    amount: optionalText(30),
    dueDate: optionalDate,
    paidDate: optionalDate
});

export type MarkOutcomeInput = z.infer<typeof markOutcomeSchema>;

export const markOutcomeBulkSchema = markOutcomeSchema.extend({
    contactIds: z
        .union([z.string(), z.array(z.string())])
        .transform((value) => (Array.isArray(value) ? value : [value]))
        .refine((ids) => ids.length > 0, "Selecciona al menos un contacto.")
});

export type MarkOutcomeBulkInput = z.infer<typeof markOutcomeBulkSchema>;
