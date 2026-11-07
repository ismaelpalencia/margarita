import { z } from "zod";

export const GUIDED_MAX_STEPS = 40;
export const GUIDED_MAX_BUTTONS = 3;

const buttonSchema = z.object({
    id: z.string().trim().min(1).max(40),
    title: z.string().trim().min(1).max(20)
});

const linkSchema = z.object({
    label: z.string().trim().min(1).max(30),
    url: z
        .string()
        .trim()
        .url("El enlace no es una URL válida.")
        .refine((url) => /^https?:\/\//i.test(url), "El enlace debe ser http o https.")
});

const messageStep = z.object({
    id: z.string().trim().min(1).max(40),
    type: z.literal("message"),
    text: z.string().trim().min(1).max(1000),
    next: z.string().trim().min(1).max(40)
});

const questionStep = z.object({
    id: z.string().trim().min(1).max(40),
    type: z.literal("question"),
    text: z.string().trim().min(1).max(1000),
    buttons: z.array(buttonSchema).min(1).max(GUIDED_MAX_BUTTONS),
    next: z.record(z.string(), z.string().trim().min(1).max(40))
});

const inputStep = z.object({
    id: z.string().trim().min(1).max(40),
    type: z.literal("input"),
    text: z.string().trim().min(1).max(1000),
    field: z
        .string()
        .trim()
        .regex(/^[a-z][a-z0-9_]{0,39}$/, "El campo debe ser un identificador en minúsculas.")
        .default("dato"),
    label: z.string().trim().max(80).optional(),
    inputType: z.enum(["text", "number"]).default("text"),
    next: z.string().trim().min(1).max(40)
});

const fileStep = z.object({
    id: z.string().trim().min(1).max(40),
    type: z.literal("file"),
    text: z.string().trim().min(1).max(1000),
    field: z
        .string()
        .trim()
        .regex(/^[a-z][a-z0-9_]{0,39}$/, "El campo debe ser un identificador en minúsculas.")
        .default("archivo"),
    label: z.string().trim().max(80).optional(),
    accept: z.enum(["image", "document", "both"]).default("both"),
    next: z.string().trim().min(1).max(40)
});

const endStep = z.object({
    id: z.string().trim().min(1).max(40),
    type: z.literal("end"),
    text: z.string().trim().min(1).max(1000),
    links: z.array(linkSchema).max(3).default([]),
    handoff: z.boolean().default(false)
});

export const guidedStepSchema = z.discriminatedUnion("type", [
    messageStep,
    questionStep,
    inputStep,
    fileStep,
    endStep
]);

export const guidedStepsSchema = z
    .array(guidedStepSchema)
    .min(1, "El flujo necesita al menos un paso.")
    .max(GUIDED_MAX_STEPS, `El flujo permite hasta ${GUIDED_MAX_STEPS} pasos.`)
    .superRefine((steps, ctx) => {
        const ids = new Set<string>();

        for (const step of steps) {
            if (ids.has(step.id)) {
                ctx.addIssue({
                    code: "custom",
                    message: `El paso «${step.id}» está repetido.`
                });
            }
            ids.add(step.id);
        }

        for (const step of steps) {
            if (step.type === "message") {
                if (!ids.has(step.next)) {
                    ctx.addIssue({
                        code: "custom",
                        message: `El paso «${step.id}» apunta a «${step.next}», que no existe.`
                    });
                }
                continue;
            }

            if (step.type === "input" || step.type === "file") {
                if (!ids.has(step.next)) {
                    ctx.addIssue({
                        code: "custom",
                        message: `El paso «${step.id}» apunta a «${step.next}», que no existe.`
                    });
                }
                continue;
            }

            if (step.type === "question") {
                const buttonIds = new Set(step.buttons.map((button) => button.id));

                if (buttonIds.size !== step.buttons.length) {
                    ctx.addIssue({
                        code: "custom",
                        message: `El paso «${step.id}» tiene botones repetidos.`
                    });
                }

                for (const button of step.buttons) {
                    const next = step.next[button.id];

                    if (!next) {
                        ctx.addIssue({
                            code: "custom",
                            message: `El botón «${button.title}» del paso «${step.id}» no tiene destino.`
                        });
                    } else if (!ids.has(next)) {
                        ctx.addIssue({
                            code: "custom",
                            message: `El botón «${button.title}» apunta a «${next}», que no existe.`
                        });
                    }
                }

                for (const key of Object.keys(step.next)) {
                    if (!buttonIds.has(key)) {
                        ctx.addIssue({
                            code: "custom",
                            message: `El paso «${step.id}» tiene un destino para un botón que no existe: «${key}».`
                        });
                    }
                }
            }
        }

        if (steps[0]?.type === "end") {
            ctx.addIssue({
                code: "custom",
                message: "El primer paso no puede ser un cierre."
            });
        }
    });

export type GuidedStep = z.infer<typeof guidedStepSchema>;
export type GuidedButton = z.infer<typeof buttonSchema>;
export type GuidedLink = z.infer<typeof linkSchema>;

export function parseGuidedSteps(value: unknown) {
    return guidedStepsSchema.safeParse(value);
}

export function normalizeGuidedText(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

export function guidedTriggerMatches(trigger: string, text: string): boolean {
    const normalized = normalizeGuidedText(text);

    if (!normalized) {
        return false;
    }

    return trigger
        .split("|")
        .map((part) => normalizeGuidedText(part))
        .filter(Boolean)
        .some((part) => normalized.includes(part));
}

export function findStep(steps: GuidedStep[], id: string): GuidedStep | null {
    return steps.find((step) => step.id === id) ?? null;
}
