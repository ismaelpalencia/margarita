import { OffHoursMode } from "@prisma/client";
import { z } from "zod";

const timeRegex = /^\d{2}:\d{2}$/;

export const hoursSchema = z.object({
    businessHoursEnabled: z
        .preprocess(
            (value) =>
                Array.isArray(value)
                    ? value.includes("true")
                        ? "true"
                        : "false"
                    : value,
            z.enum(["true", "false"]).default("false")
        )
        .transform((value) => value === "true"),
    timezone: z
        .string()
        .trim()
        .min(1, "La zona horaria es obligatoria.")
        .max(64, "La zona horaria es demasiado larga."),
    days: z
        .array(z.coerce.number())
        .default([])
        .transform((days) =>
            days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        ),
    start: z.string().regex(timeRegex, "La hora de inicio es inválida."),
    end: z.string().regex(timeRegex, "La hora de fin es inválida."),
    mode: z.nativeEnum(OffHoursMode),
    message: z.string().trim().max(1000, "El mensaje es demasiado largo."),
    intervalHours: z.coerce.number().int().min(1).max(72)
});

export type HoursInput = z.infer<typeof hoursSchema>;
