import { Request, Response } from "express";
import { LogLevel, LogModule, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../config/prisma";
import { LogService } from "../services/log.service";
import { getRequiredParam } from "../utils/request";
import { parseGuidedSteps } from "../utils/guided-flow";
import { PENSION_GUIDED_TEMPLATE } from "../utils/guided-flow.template";
import {
    GuidedFlowGenerationError,
    GuidedFlowGeneratorService
} from "../services/ai/guided-flow-generator.service";

const formSchema = z.object({
    name: z.string().trim().min(2, "El nombre es obligatorio.").max(80),
    slug: z.string().trim().max(60).optional().default(""),
    trigger: z.string().trim().min(2, "El trigger es obligatorio.").max(200),
    steps: z.string().min(2, "Los pasos son obligatorios."),
    isActive: z.string().optional(),
    requiresApproval: z.string().optional(),
    leadCapture: z.string().optional(),
    leadNameField: z.string().trim().max(40).optional().default(""),
    leadEmailField: z.string().trim().max(40).optional().default(""),
    leadInterestField: z.string().trim().max(40).optional().default(""),
    leadFields: z.union([z.string(), z.array(z.string())]).optional()
});

function slugify(value: string, fallback: string): string {
    const slug = value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);

    return slug || fallback;
}

async function uniqueGuidedSlug(workspaceId: string, base: string) {
    let slug = base;
    let suffix = 2;

    while (
        await prisma.guidedFlow.findUnique({
            where: { workspaceId_slug: { workspaceId, slug } },
            select: { id: true }
        })
    ) {
        slug = `${base}-${suffix}`.slice(0, 60);
        suffix += 1;
    }

    return slug;
}

function leadFieldsFrom(value: unknown): string[] {
    const values = Array.isArray(value)
        ? value
        : typeof value === "string"
          ? value.split(",")
          : value
            ? [value]
            : [];

    return Array.from(
        new Set(
            values
                .map((item) => String(item).trim())
                .filter((item) => /^[A-Za-z0-9_-]{1,40}$/.test(item))
        )
    ).slice(0, 40);
}

function parseStepsInput(value: string) {
    let raw: unknown;

    try {
        raw = JSON.parse(value);
    } catch {
        throw new Error("Los pasos no son un JSON válido.");
    }

    const parsed = parseGuidedSteps(raw);

    if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message || "Pasos inválidos.");
    }

    return parsed.data;
}

export class AdminGuidedFlowController {
    static async index(req: Request, res: Response) {
        const flows = await prisma.guidedFlow.findMany({
            where: { workspaceId: req.user!.workspaceId },
            orderBy: [
                { isDraft: "desc" },
                { isActive: "desc" },
                { createdAt: "desc" }
            ]
        });

        if (req.accepts("json") && !req.accepts("html")) return res.json({ flows: flows.map(({ id, name, slug, trigger, isActive, isDraft, draftSummary, draftMissing, createdAt }) => ({ id, name, slug, trigger, isActive, isDraft, draftSummary, draftMissing, createdAt })) });

        const query = req.originalUrl.includes("?")
            ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
            : "";
        return res.redirect(`/panel/admin/ai/guided-flows${query}`);
    }

    static async generate(req: Request, res: Response) {
        const source = String(req.body?.source || "").trim();
        const context = String(req.body?.context || "").trim();
        const instructions = String(req.body?.instructions || "").trim();

        try {
            const result = await GuidedFlowGeneratorService.generate({
                workspaceId: req.user!.workspaceId,
                source,
                context,
                instructions
            });

            const slug = await uniqueGuidedSlug(
                req.user!.workspaceId,
                slugify(result.name, "flujo")
            );

            const flow = await prisma.guidedFlow.create({
                data: {
                    workspaceId: req.user!.workspaceId,
                    name: result.name,
                    slug,
                    trigger: result.trigger,
                    steps: result.steps as unknown as Prisma.InputJsonValue,
                    isActive: false,
                    isDraft: true,
                    draftSummary: result.summary || null,
                    draftMissing:
                        result.missing as unknown as Prisma.InputJsonValue
                }
            });

            const redirectUrl = `/panel/admin/ai/guided-flows/${flow.id}?draft=1`;
            if (req.accepts("json")) {
                return res.json({ ok: true, redirectUrl });
            }
            return res.redirect(redirectUrl);
        } catch (error) {
            const message =
                error instanceof GuidedFlowGenerationError
                    ? error.message
                    : "No se pudo generar el flujo. Intenta de nuevo.";

            if (req.accepts("json")) {
                return res.status(400).json({ error: message });
            }
            return res.redirect("/panel/admin/ai/guided-flows/new?error=generate");
        }
    }

    static async revise(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");
        const prompt = String(req.body?.source || "").trim();
        const flow = await prisma.guidedFlow.findFirst({
            where: { id, workspaceId: req.user!.workspaceId }
        });

        if (!flow) {
            if (req.accepts("json")) {
                return res.status(404).json({ error: "No se encontró el flujo." });
            }
            return res.redirect("/panel/admin/ai/guided-flows?error=not_found");
        }

        if (!prompt) {
            const message = "Escribe los cambios que quieres hacerle al flujo.";
            if (req.accepts("json")) {
                return res.status(400).json({ error: message });
            }
            return res.redirect(
                `/panel/admin/ai/guided-flows/${flow.id}?error=prompt`
            );
        }

        const current = JSON.stringify(
            {
                name: flow.name,
                trigger: flow.trigger,
                summary: flow.draftSummary || "",
                steps: flow.steps
            },
            null,
            2
        );

        try {
            const result = await GuidedFlowGeneratorService.generate({
                workspaceId: req.user!.workspaceId,
                source: `FLUJO ACTUAL (referencia, no cambies lo que no se pide):\n${current}\n\nCAMBIO SOLICITADO:\n${prompt}`,
                instructions:
                    "Devuelve el flujo completo modificado. Conserva los pasos, textos, ids y ramas que no se piden cambiar. No inventes integraciones ni prometas montos."
            });

            if (req.accepts("json")) return res.json({ values: { name: result.name || flow.name, slug: flow.slug, trigger: result.trigger || flow.trigger, isActive: flow.isActive, leadCapture: flow.leadCapture, requiresApproval: flow.requiresApproval, leadNameField: flow.leadNameField || "", leadEmailField: flow.leadEmailField || "", leadInterestField: flow.leadInterestField || "", leadFields: flow.leadFields }, steps: result.steps, summary: result.summary || null, missing: result.missing });

            return res.redirect(`/panel/admin/ai/guided-flows/${flow.id}?draft=1`);
        } catch (error) {
            const message =
                error instanceof GuidedFlowGenerationError
                    ? error.message
                    : "No se pudo modificar el flujo. Intenta de nuevo.";

            if (req.accepts("json")) {
                return res.status(400).json({ error: message });
            }
            return res.redirect(
                `/panel/admin/ai/guided-flows/${flow.id}?error=revise`
            );
        }
    }

    static async newForm(req: Request, res: Response) {
        const template = req.query.template === "pension";

        if (req.accepts("json") && !req.accepts("html")) return res.json({ flow: null, values: { name: template ? PENSION_GUIDED_TEMPLATE.name : "", slug: template ? PENSION_GUIDED_TEMPLATE.slug : "", trigger: template ? PENSION_GUIDED_TEMPLATE.trigger : "", isActive: true, leadCapture: false, requiresApproval: false, leadNameField: "", leadEmailField: "", leadInterestField: "", leadFields: [] }, steps: template ? PENSION_GUIDED_TEMPLATE.steps : [] });

        const query = req.originalUrl.includes("?")
            ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
            : "";
        return res.redirect(`/panel/admin/ai/guided-flows/new${query}`);
    }

    static async create(req: Request, res: Response) {
        const parsed = formSchema.safeParse(req.body);

        if (!parsed.success) {
            const message =
                parsed.error.issues[0]?.message || "Datos inválidos.";
            if (req.accepts("json")) {
                return res.status(400).json({ error: message });
            }
            return res.redirect(
                "/panel/admin/ai/guided-flows/new?error=validation"
            );
        }

        try {
            const steps = parseStepsInput(parsed.data.steps);
            const flow = await prisma.guidedFlow.create({
                data: {
                    workspaceId: req.user!.workspaceId,
                    name: parsed.data.name,
                    slug: slugify(parsed.data.slug || parsed.data.name, "flujo"),
                    trigger: parsed.data.trigger,
                    steps: steps as unknown as Prisma.InputJsonValue,
                    isActive: parsed.data.isActive === "on",
                    leadCapture: parsed.data.leadCapture === "on",
                    requiresApproval: parsed.data.requiresApproval === "on",
                    leadNameField: parsed.data.leadNameField || null,
                    leadEmailField: parsed.data.leadEmailField || null,
                    leadInterestField:
                        parsed.data.leadInterestField || null,
                    leadFields: leadFieldsFrom(parsed.data.leadFields)
                }
            });

            await LogService.create({
                workspaceId: req.user!.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.AI,
                action: "GUIDED_FLOW_CREATED",
                message: `Se creó el flujo guiado «${flow.name}».`,
                payload: { flowId: flow.id }
            }).catch(() => undefined);

            const redirectUrl = "/panel/admin/ai/guided-flows?success=created";
            if (req.accepts("json")) {
                return res.json({ ok: true, redirectUrl });
            }
            return res.redirect(redirectUrl);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "No se pudo crear el flujo.";

            if (req.accepts("json")) {
                return res.status(400).json({ error: message });
            }
            return res.redirect(
                "/panel/admin/ai/guided-flows/new?error=create"
            );
        }
    }

    static async editForm(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");
        const flow = await prisma.guidedFlow.findFirst({
            where: { id, workspaceId: req.user!.workspaceId }
        });

        if (!flow) {
            if (req.accepts("json")) {
                return res.status(404).json({ error: "No se encontró el flujo." });
            }
            return res.redirect("/panel/admin/ai/guided-flows?error=not_found");
        }

        const missing = flow.isDraft && Array.isArray(flow.draftMissing)
            ? (flow.draftMissing as string[])
            : [];

        if (req.accepts("json") && !req.accepts("html")) return res.json({ flow: { id: flow.id, isDraft: flow.isDraft, draftSummary: flow.draftSummary, draftMissing: missing }, values: { name: flow.name, slug: flow.slug, trigger: flow.trigger, isActive: flow.isDraft ? true : flow.isActive, leadCapture: flow.leadCapture, requiresApproval: flow.requiresApproval, leadNameField: flow.leadNameField || "", leadEmailField: flow.leadEmailField || "", leadInterestField: flow.leadInterestField || "", leadFields: flow.leadFields }, steps: flow.steps });

        const query = req.originalUrl.includes("?")
            ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
            : "";
        return res.redirect(
            `/panel/admin/ai/guided-flows/${encodeURIComponent(flow.id)}${query}`
        );
    }

    static async update(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");
        const flow = await prisma.guidedFlow.findFirst({
            where: { id, workspaceId: req.user!.workspaceId }
        });

        if (!flow) {
            if (req.accepts("json")) {
                return res.status(404).json({ error: "No se encontró el flujo." });
            }
            return res.redirect("/panel/admin/ai/guided-flows?error=not_found");
        }

        const parsed = formSchema.safeParse(req.body);

        if (!parsed.success) {
            const message =
                parsed.error.issues[0]?.message || "Datos inválidos.";
            if (req.accepts("json")) {
                return res.status(400).json({ error: message });
            }
            return res.redirect(
                `/panel/admin/ai/guided-flows/${flow.id}?error=validation`
            );
        }

        try {
            const steps = parseStepsInput(parsed.data.steps);

            await prisma.guidedFlow.update({
                where: { id: flow.id },
                data: {
                    name: parsed.data.name,
                    slug: slugify(parsed.data.slug || parsed.data.name, "flujo"),
                    trigger: parsed.data.trigger,
                    steps: steps as unknown as Prisma.InputJsonValue,
                    isActive: parsed.data.isActive === "on",
                    leadCapture: parsed.data.leadCapture === "on",
                    requiresApproval: parsed.data.requiresApproval === "on",
                    leadNameField: parsed.data.leadNameField || null,
                    leadEmailField: parsed.data.leadEmailField || null,
                    leadInterestField:
                        parsed.data.leadInterestField || null,
                    leadFields: leadFieldsFrom(parsed.data.leadFields),
                    isDraft: false,
                    draftSummary: null,
                    draftMissing: Prisma.DbNull
                }
            });

            if (parsed.data.isActive !== "on") {
                await prisma.guidedFlowRun.updateMany({
                    where: { flowId: flow.id, status: "ACTIVE" },
                    data: { status: "COMPLETED" }
                });
            }

            await LogService.create({
                workspaceId: req.user!.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.AI,
                action: "GUIDED_FLOW_UPDATED",
                message: `Se actualizó el flujo guiado «${parsed.data.name}».`,
                payload: { flowId: flow.id }
            }).catch(() => undefined);

            const redirectUrl = "/panel/admin/ai/guided-flows?success=updated";
            if (req.accepts("json")) {
                return res.json({ ok: true, redirectUrl });
            }
            return res.redirect(redirectUrl);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "No se pudo actualizar el flujo.";

            if (req.accepts("json")) {
                return res.status(400).json({ error: message });
            }
            return res.redirect(
                `/panel/admin/ai/guided-flows/${flow.id}?error=update`
            );
        }
    }

    static async remove(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");
        const flow = await prisma.guidedFlow.findFirst({
            where: { id, workspaceId: req.user!.workspaceId }
        });

        if (!flow) {
            if (req.accepts("json")) {
                return res.status(404).json({ error: "No se encontró el flujo." });
            }
            return res.redirect("/panel/admin/ai/guided-flows?error=not_found");
        }

        await prisma.guidedFlow.delete({ where: { id: flow.id } });

        await LogService.create({
            workspaceId: req.user!.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.AI,
            action: "GUIDED_FLOW_DELETED",
            message: `Se eliminó el flujo guiado «${flow.name}».`,
            payload: { flowId: flow.id }
        }).catch(() => undefined);

        return res.redirect("/panel/admin/ai/guided-flows?success=deleted");
    }

    static async toggle(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");
        const flow = await prisma.guidedFlow.findFirst({
            where: { id, workspaceId: req.user!.workspaceId }
        });

        if (!flow) {
            if (req.accepts("json")) {
                return res.status(404).json({ error: "No se encontró el flujo." });
            }
            return res.redirect("/panel/admin/ai/guided-flows?error=not_found");
        }

        await prisma.guidedFlow.update({
            where: { id: flow.id },
            data: { isActive: !flow.isActive }
        });

        if (flow.isActive) {
            await prisma.guidedFlowRun.updateMany({
                where: { flowId: flow.id, status: "ACTIVE" },
                data: { status: "COMPLETED" }
            });
        }

        await LogService.create({
            workspaceId: req.user!.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.AI,
            action: flow.isActive
                ? "GUIDED_FLOW_DEACTIVATED"
                : "GUIDED_FLOW_ACTIVATED",
            message: `Flujo guiado «${flow.name}» ${flow.isActive ? "apagado" : "encendido"}.`,
            payload: { flowId: flow.id }
        }).catch(() => undefined);

        return res.redirect("/panel/admin/ai/guided-flows?success=toggled");
    }
}
