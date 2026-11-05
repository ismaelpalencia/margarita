import { Request, Response } from "express";
import { LogLevel, LogModule, Prisma } from "@prisma/client";

import { prisma } from "../config/prisma";
import { FlowService } from "../services/flow.service";
import { LogService } from "../services/log.service";
import { getRequiredParam } from "../utils/request";
import { FlowButton, FlowList } from "../utils/flow";

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => String(item));
    }

    return typeof value === "string" ? [value] : [];
}

function slugForButton(title: string, index: number): string {
    const slug = title
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);

    return slug || "BOTON_" + (index + 1);
}

export class AdminFlowController {
    static async index(req: Request, res: Response) {
        const [packages, flows, flags] = await Promise.all([
            Promise.resolve(FlowService.listPackages()),
            prisma.flow.findMany({
                where: { workspaceId: req.user!.workspaceId },
                orderBy: { name: "asc" }
            }),
            prisma.workspace.findUniqueOrThrow({
                where: { id: req.user!.workspaceId },
                select: { flowsEnabled: true }
            })
        ]);

        return res.render("pages/admin/ai/package", {
            user: req.user,
            packages,
            flows,
            loadedFlows: flows.length,
            flowsEnabled: flags.flowsEnabled,
            success: req.query.success || null,
            error: req.query.error || null,
            counts: req.query.counts || null
        });
    }

    static async load(req: Request, res: Response) {
        const vertical = String(req.body?.vertical || "");

        if (!["comercio", "servicios", "generico"].includes(vertical)) {
            return res.redirect("/admin/ai/package?error=invalid");
        }

        const flowSlugs = toStringArray(req.body?.flows);
        const kbIndexes = toStringArray(req.body?.kb)
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value));

        try {
            const result = await FlowService.loadPackage({
                workspaceId: req.user!.workspaceId,
                userId: req.user!.id,
                vertical,
                flowSlugs,
                kbIndexes
            });

            const counts = encodeURIComponent(JSON.stringify(result));

            return res.redirect(`/admin/ai/package?success=loaded&counts=${counts}`);
        } catch {
            return res.redirect("/admin/ai/package?error=load");
        }
    }

    /** Enciende o apaga el motor de flujos de todo el workspace. */
    static async toggleFlows(req: Request, res: Response) {
        const enabled = req.body?.enabled === "true";

        await prisma.workspace.update({
            where: { id: req.user!.workspaceId },
            data: { flowsEnabled: enabled }
        });

        await LogService.create({
            workspaceId: req.user!.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.AI,
            action: "FLOWS_ENABLED_CHANGED",
            message: enabled
                ? "Se encendieron los flujos de bienvenida."
                : "Se apagaron los flujos de bienvenida.",
            payload: { enabled }
        }).catch(() => undefined);

        return res.redirect("/admin/ai/package?success=flows");
    }

    /** Activa o desactiva un flujo concreto. */
    static async toggleFlow(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");
        const flow = await prisma.flow.findFirst({
            where: { id, workspaceId: req.user!.workspaceId }
        });

        if (!flow) {
            return res.redirect("/admin/ai/package?error=flow");
        }

        await prisma.flow.update({
            where: { id: flow.id },
            data: { isActive: !flow.isActive }
        });

        await LogService.create({
            workspaceId: req.user!.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.AI,
            action: flow.isActive ? "FLOW_DEACTIVATED" : "FLOW_ACTIVATED",
            message: `Flujo «${flow.name}» ${flow.isActive ? "apagado" : "encendido"}.`,
            payload: { flowId: flow.id, slug: flow.slug }
        }).catch(() => undefined);

        return res.redirect("/admin/ai/package?success=flow");
    }

    /** Formulario para editar el trigger, la respuesta y los botones. */
    static async edit(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");
        const flow = await prisma.flow.findFirst({
            where: { id, workspaceId: req.user!.workspaceId }
        });

        if (!flow) {
            return res.redirect("/admin/ai/package?error=flow");
        }

        const buttons = (flow.buttons as FlowButton[] | null) ?? [];
        const list = (flow.list as FlowList | null) ?? null;

        return res.render("pages/admin/ai/flow-edit", {
            user: req.user,
            flow,
            buttons,
            list,
            isList: Boolean(flow.list),
            error: req.query.error || null,
            success: req.query.success || null
        });
    }

    static async update(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");
        const flow = await prisma.flow.findFirst({
            where: { id, workspaceId: req.user!.workspaceId }
        });

        if (!flow) {
            return res.redirect("/admin/ai/package?error=flow");
        }

        const trigger = String(req.body?.trigger || "").trim();
        const reply = String(req.body?.reply || "").trim();

        if (!trigger || !reply) {
            return res.redirect(`/admin/ai/flows/${id}?error=empty`);
        }

        const removeButtons = req.body?.removeButtons === "true";
        const titles = toStringArray(req.body?.buttonTitle).map((title) => title.trim());
        const ids = toStringArray(req.body?.buttonId);
        const current = (flow.buttons as FlowButton[] | null) ?? [];
        const buttons: FlowButton[] = [];

        for (let index = 0; index < titles.length; index += 1) {
            const title = titles[index];

            if (!title) {
                continue;
            }

            if (title.length > 20) {
                return res.redirect(`/admin/ai/flows/${id}?error=title`);
            }

            const existing = current[index];
            const buttonId = (ids[index] || existing?.id || slugForButton(title, index)).trim();

            buttons.push({ id: buttonId, title });
        }

        if (buttons.length > 3) {
            return res.redirect(`/admin/ai/flows/${id}?error=count`);
        }

        if (new Set(buttons.map((button) => button.id)).size !== buttons.length) {
            return res.redirect(`/admin/ai/flows/${id}?error=duplicate`);
        }

        const data: Prisma.FlowUpdateInput = { trigger, reply };

        if (removeButtons) {
            data.buttons = Prisma.DbNull;
        } else if (buttons.length > 0) {
            data.buttons = buttons as unknown as Prisma.InputJsonValue;
        }

        /** Lista: solo se edita si el flujo ya era de tipo lista. */
        if (flow.list) {
            const removeList = req.body?.removeList === "true";

            if (removeList) {
                data.list = Prisma.DbNull;
            } else {
                const buttonLabel = String(req.body?.listButtonLabel || "").trim();
                const sectionTitle = String(req.body?.listSectionTitle || "").trim();
                const rowTitles = toStringArray(req.body?.rowTitle).map((title) => title.trim());
                const rowIds = toStringArray(req.body?.rowId);
                const rowDescriptions = toStringArray(req.body?.rowDescription).map((description) => description.trim());
                const rows: FlowList["rows"] = [];

                for (let index = 0; index < rowTitles.length; index += 1) {
                    const title = rowTitles[index];

                    if (!title) {
                        continue;
                    }

                    if (title.length > 24) {
                        return res.redirect(`/admin/ai/flows/${id}?error=listTitle`);
                    }

                    const description = rowDescriptions[index] || "";

                    if (description.length > 72) {
                        return res.redirect(`/admin/ai/flows/${id}?error=listDescription`);
                    }

                    rows.push({
                        id: (rowIds[index] || "ROW_" + (index + 1)).trim(),
                        title,
                        description: description || undefined
                    });
                }

                if (rows.length > 10) {
                    return res.redirect(`/admin/ai/flows/${id}?error=listCount`);
                }

                if (rows.length > 0 && !buttonLabel) {
                    return res.redirect(`/admin/ai/flows/${id}?error=listLabel`);
                }

                if (buttonLabel.length > 20) {
                    return res.redirect(`/admin/ai/flows/${id}?error=listLabel`);
                }

                if (sectionTitle.length > 24) {
                    return res.redirect(`/admin/ai/flows/${id}?error=listSection`);
                }

                if (new Set(rows.map((row) => row.id)).size !== rows.length) {
                    return res.redirect(`/admin/ai/flows/${id}?error=listDuplicate`);
                }

                if (rows.length > 0) {
                    data.list = {
                        buttonLabel,
                        sectionTitle: sectionTitle || undefined,
                        rows
                    } as unknown as Prisma.InputJsonValue;
                }
            }
        }

        await prisma.flow.update({
            where: { id: flow.id },
            data
        });

        await LogService.create({
            workspaceId: req.user!.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.AI,
            action: "FLOW_UPDATED",
            message: `Flujo «${flow.name}» actualizado.`,
            payload: { flowId: flow.id, slug: flow.slug }
        }).catch(() => undefined);

        return res.redirect(`/admin/ai/flows/${id}?success=saved`);
    }
}