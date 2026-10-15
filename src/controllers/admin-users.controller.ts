import { Request, Response } from "express";

import { UserService } from "../services/user.service";
import { SendPolicyService } from "../services/send-policy.service";
import { getRequiredParam } from "../utils/request";
import {
    changePasswordSchema,
    createUserSchema,
    resetPasswordSchema,
    updateUserSchema
} from "../validations/user.validation";

const EMPTY_FORM = {
    name: "",
    email: "",
    role: "AGENT",
    manualMessageLimit: ""
};

export class AdminUsersController {
    static async index(req: Request, res: Response) {
        const workspaceId = req.user!.workspaceId;

        const [team, usageToday, activeAdmins] = await Promise.all([
            UserService.listTeam(workspaceId),
            SendPolicyService.usageTodayByUser(workspaceId),
            UserService.countActiveAdmins(workspaceId)
        ]);

        return res.render("pages/admin/users/index", {
            user: req.user,
            team,
            usageToday,
            activeAdmins,
            error: req.query.error || null,
            success: req.query.success || null
        });
    }

    static showCreate(req: Request, res: Response) {
        return res.render("pages/admin/users/create", {
            user: req.user,
            error: null,
            old: EMPTY_FORM,
            suggestedPassword: UserService.suggestPassword()
        });
    }

    static async create(req: Request, res: Response) {
        const parsed = createUserSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).render("pages/admin/users/create", {
                user: req.user,
                error: parsed.error.issues[0]?.message || "Datos inválidos.",
                old: {
                    name: req.body.name || "",
                    email: req.body.email || "",
                    role: req.body.role || "AGENT",
                    manualMessageLimit: req.body.manualMessageLimit || ""
                },
                suggestedPassword: UserService.suggestPassword()
            });
        }

        try {
            await UserService.createUser(req.user!.workspaceId, parsed.data);

            return res.redirect("/admin/users?success=created");
        } catch (error) {
            return res.status(400).render("pages/admin/users/create", {
                user: req.user,
                error:
                    error instanceof Error
                        ? error.message
                        : "No se pudo crear el usuario.",
                old: {
                    name: req.body.name || "",
                    email: req.body.email || "",
                    role: req.body.role || "AGENT",
                    manualMessageLimit: req.body.manualMessageLimit || ""
                },
                suggestedPassword: UserService.suggestPassword()
            });
        }
    }

    static async showEdit(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            const [member, activeAdmins] = await Promise.all([
                UserService.getMemberById(req.user!.workspaceId, id),
                UserService.countActiveAdmins(req.user!.workspaceId)
            ]);

            return res.render("pages/admin/users/edit", {
                user: req.user,
                member,
                activeAdmins,
                suggestedPassword: UserService.suggestPassword(),
                error: req.query.error || null,
                success: req.query.success || null
            });
        } catch {
            return res.redirect("/admin/users");
        }
    }

    static async update(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        const parsed = updateUserSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/admin/users/${id}/edit?error=${
                    encodeURIComponent(
                        parsed.error.issues[0]?.message || "Datos inválidos."
                    )
                }`
            );
        }

        try {
            await UserService.updateUser(
                req.user!.workspaceId,
                id,
                parsed.data,
                req.user!.id
            );

            return res.redirect("/admin/users?success=updated");
        } catch (error) {
            return res.redirect(
                `/admin/users/${id}/edit?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo actualizar."
                )}`
            );
        }
    }

    static async toggleStatus(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            const member = await UserService.getMemberById(
                req.user!.workspaceId,
                id
            );

            await UserService.setActive(
                req.user!.workspaceId,
                id,
                !member.isActive,
                req.user!.id
            );
        } catch (error) {
            return res.redirect(
                `/admin/users?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo cambiar el estado."
                )}`
            );
        }

        return res.redirect("/admin/users?success=status");
    }

    /**
     * Restablecer la contraseña de otra persona. La contraseña nueva la
     * escribe el administrador y quien la recibe debe cambiarla al entrar.
     */
    static async resetPassword(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        const parsed = resetPasswordSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/admin/users/${id}/edit?error=${encodeURIComponent(
                    parsed.error.issues[0]?.message || "Contraseña inválida."
                )}`
            );
        }

        try {
            await UserService.resetPassword(
                req.user!.workspaceId,
                id,
                parsed.data.password,
                req.user!.id
            );
        } catch (error) {
            return res.redirect(
                `/admin/users/${id}/edit?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo restablecer."
                )}`
            );
        }

        return res.redirect(`/admin/users/${id}/edit?success=password`);
    }
}

/**
 * Cambio de contraseña por la propia persona. Vive fuera de `/admin` y
 * `/agent` para que sea la misma pantalla para los dos roles.
 */
export class AccountController {
    static show(req: Request, res: Response) {
        return res.render("pages/account/password", {
            authUser: req.user!,
            required: req.query.required === "1",
            success: req.query.success || null,
            error: req.query.error || null,
            changed: req.query.changed === "1"
        });
    }

    static async change(req: Request, res: Response) {
        const parsed = changePasswordSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/account/password?error=${encodeURIComponent(
                    parsed.error.issues[0]?.message || "Datos inválidos."
                )}`
            );
        }

        try {
            const result = await UserService.changeOwnPassword({
                userId: req.user!.id,
                currentPassword: parsed.data.currentPassword,
                newPassword: parsed.data.password,
                keepTokenId: req.tokenId
            });

            return res.redirect(
                `/account/password?changed=1&closed=${result.otherSessionsClosed}`
            );
        } catch (error) {
            return res.redirect(
                `/account/password?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo cambiar la contraseña."
                )}`
            );
        }
    }
}
