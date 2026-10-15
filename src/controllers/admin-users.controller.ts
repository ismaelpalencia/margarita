import { Request, Response } from "express";

import { UserService } from "../services/user.service";
import { SendPolicyService } from "../services/send-policy.service";
import { getRequiredParam } from "../utils/request";
import {
    changePasswordSchema,
    createUserSchema,
    resetPasswordSchema,
    twoFactorCodeSchema,
    updateUserSchema
} from "../validations/user.validation";
import { formatSecretForHumans } from "../utils/totp";

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

    /**
     * Recuperación: apagar la verificación en dos pasos de alguien que
     * perdió el teléfono. Queda en la bitácora con quién lo hizo, para que
     * no sea una forma silenciosa de entrar a una cuenta.
     */
    static async disableTwoFactor(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            await UserService.disableTwoFactorAsAdmin(
                req.user!.workspaceId,
                id,
                req.user!.id
            );
        } catch (error) {
            return res.redirect(
                `/admin/users/${id}/edit?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo desactivar la verificación en dos pasos."
                )}`
            );
        }

        return res.redirect(`/admin/users/${id}/edit?success=two-factor`);
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

    /** Pantalla de seguridad: contraseña + verificación en dos pasos. */
    static async showSecurity(req: Request, res: Response) {
        const state = await UserService.twoFactorState(req.user!.id);

        return res.render("pages/account/security", {
            authUser: req.user!,
            state,
            formattedSecret: state.pendingSecret
                ? formatSecretForHumans(state.pendingSecret)
                : null,
            error: req.query.error || null,
            success: req.query.success || null
        });
    }

    /** Genera la clave y muestra la pantalla para confirmarla. */
    static async startTwoFactor(req: Request, res: Response) {
        try {
            await UserService.startTwoFactor(req.user!.id);
        } catch (error) {
            return res.redirect(
                `/account/security?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo iniciar la activación."
                )}`
            );
        }

        return res.redirect("/account/security");
    }

    static async confirmTwoFactor(req: Request, res: Response) {
        const parsed = twoFactorCodeSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/account/security?error=${encodeURIComponent(
                    parsed.error.issues[0]?.message || "Código inválido."
                )}`
            );
        }

        try {
            await UserService.confirmTwoFactor(req.user!.id, parsed.data.code);
        } catch (error) {
            return res.redirect(
                `/account/security?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo confirmar el código."
                )}`
            );
        }

        return res.redirect("/account/security?success=enabled");
    }

    static async disableTwoFactor(req: Request, res: Response) {
        const parsed = twoFactorCodeSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect(
                `/account/security?error=${encodeURIComponent(
                    parsed.error.issues[0]?.message || "Código inválido."
                )}`
            );
        }

        try {
            await UserService.disableTwoFactor(req.user!.id, parsed.data.code);
        } catch (error) {
            return res.redirect(
                `/account/security?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo desactivar."
                )}`
            );
        }

        return res.redirect("/account/security?success=disabled");
    }

    /** Descartar una activación que nunca se confirmó. */
    static async cancelTwoFactor(req: Request, res: Response) {
        await UserService.cancelTwoFactor(req.user!.id);

        return res.redirect("/account/security?success=cancelled");
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
