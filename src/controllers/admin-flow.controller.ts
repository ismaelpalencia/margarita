import { Request, Response } from "express";

import { prisma } from "../config/prisma";
import { FlowService } from "../services/flow.service";

export class AdminFlowController {
    static async index(req: Request, res: Response) {
        const [packages, flows, flags] = await Promise.all([
            Promise.resolve(FlowService.listPackages()),
            prisma.flow.count({ where: { workspaceId: req.user!.workspaceId } }),
            prisma.workspace.findUniqueOrThrow({
                where: { id: req.user!.workspaceId },
                select: { flowsEnabled: true }
            })
        ]);

        return res.render("pages/admin/ai/package", {
            user: req.user,
            packages,
            loadedFlows: flows,
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

        const flowSlugs = Array.isArray(req.body?.flows)
            ? req.body.flows.map((value: unknown) => String(value))
            : typeof req.body?.flows === "string"
              ? [req.body.flows]
              : [];
        const kbIndexes = (Array.isArray(req.body?.kb)
            ? req.body.kb
            : typeof req.body?.kb === "string"
              ? [req.body.kb]
              : []
        ).map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value));

        try {
            const result = await FlowService.loadPackage({
                workspaceId: req.user!.workspaceId,
                userId: req.user!.id,
                vertical,
                flowSlugs,
                kbIndexes
            });

            const counts = encodeURIComponent(
                JSON.stringify(result)
            );

            return res.redirect(`/admin/ai/package?success=loaded&counts=${counts}`);
        } catch {
            return res.redirect("/admin/ai/package?error=load");
        }
    }
}