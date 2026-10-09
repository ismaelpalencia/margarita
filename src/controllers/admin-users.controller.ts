import { Request, Response } from "express";

import { UserService } from "../services/user.service";
import { getRequiredParam } from "../utils/request";
import {
    createAgentSchema,
    updateAgentSchema
} from "../validations/user.validation";

export class AdminUsersController {
    static async index(req: Request, res: Response) {
        const workspaceId = req.user!.workspaceId;

        const agents = await UserService.listAgents(workspaceId);

        return res.render("pages/admin/users/index", {
            user: req.user,
            agents,
            error: null,
            success: req.query.success || null
        });
    }

    static showCreate(req: Request, res: Response) {
        return res.render("pages/admin/users/create", {
            user: req.user,
            error: null,
            old: {
                name: "",
                email: "",
                manualMessageLimit: ""
            }
        });
    }

    static async create(req: Request, res: Response) {
        const parsed = createAgentSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).render("pages/admin/users/create", {
                user: req.user,
                error: parsed.error.issues[0]?.message || "Datos inválidos.",
                old: {
                    name: req.body.name || "",
                    email: req.body.email || "",
                    manualMessageLimit: req.body.manualMessageLimit || ""
                }
            });
        }

        try {
            await UserService.createAgent(req.user!.workspaceId, parsed.data);

            return res.redirect("/admin/users?success=created");
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "No se pudo crear el agente.";

            return res.status(400).render("pages/admin/users/create", {
                user: req.user,
                error: message,
                old: {
                    name: req.body.name || "",
                    email: req.body.email || "",
                    manualMessageLimit: req.body.manualMessageLimit || ""
                }
            });
        }
    }

    static async showEdit(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            const agent = await UserService.getAgentById(
                req.user!.workspaceId,
                id
            );

            return res.render("pages/admin/users/edit", {
                user: req.user,
                agent,
                error: null
            });
        } catch {
            return res.redirect("/admin/users");
        }
    }

    static async update(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        const parsed = updateAgentSchema.safeParse(req.body);

        if (!parsed.success) {
            const agent = await UserService.getAgentById(
                req.user!.workspaceId,
                id
            );

            return res.status(400).render("pages/admin/users/edit", {
                user: req.user,
                agent,
                error: parsed.error.issues[0]?.message || "Datos inválidos."
            });
        }

        try {
            await UserService.updateAgent(
                req.user!.workspaceId,
                id,
                parsed.data
            );

            return res.redirect("/admin/users?success=updated");
        } catch {
            return res.redirect("/admin/users");
        }
    }

    static async toggleStatus(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            await UserService.toggleAgentStatus(req.user!.workspaceId, id);
        } catch {
            // No detenemos el flujo visual por ahora.
        }

        return res.redirect("/admin/users?success=status");
    }
}