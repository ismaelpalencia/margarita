import { Request, Response } from "express";

import { prisma } from "../config/prisma";
import { UserService } from "../services/user.service";
import { WhatsAppNumberService } from "../services/whatsapp-number.service";
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
import { qrSvg } from "../utils/qr";

const EMPTY_FORM = {
    name: "",
    email: "",
    role: "AGENT",
    manualMessageLimit: "",
    allowedNumberIds: [] as string[]
};

function wantsJson(req: Request): boolean {
    return Boolean(req.accepts("json") && !req.accepts("html"));
}

function safeNumbers(numbers: Awaited<ReturnType<typeof WhatsAppNumberService.listNumbers>>) {
    return numbers.map(({ id, displayName, phoneNumber }) => ({ id, displayName, phoneNumber }));
}

export class AdminUsersController {
    static async index(req: Request, res: Response) {
        const workspaceId = req.user!.workspaceId;

        const [team, usageToday, activeAdmins] = await Promise.all([
            UserService.listTeam(workspaceId),
            SendPolicyService.usageTodayByUser(workspaceId),
            UserService.countActiveAdmins(workspaceId)
        ]);

        if (wantsJson(req)) {
            return res.json({
                team: team.map(({ id, name, email, role, status, isActive, canSendManualMessages, manualMessageLimit }) => ({
                    id, name, email, role, status, isActive, canSendManualMessages, manualMessageLimit,
                    usedToday: usageToday[id] || 0
                })),
                activeAdmins,
                currentUserId: req.user!.id
            });
        }

        return res.redirect("/panel/admin/users");
    }

    static async showCreate(req: Request, res: Response) {
        const numbers = await WhatsAppNumberService.listNumbers(
            req.user!.workspaceId
        );

        if (wantsJson(req)) {
            return res.json({ numbers: safeNumbers(numbers), suggestedPassword: UserService.suggestPassword() });
        }

        return res.redirect("/panel/admin/users/new");
    }

    static async create(req: Request, res: Response) {
        const numbers = await WhatsAppNumberService.listNumbers(
            req.user!.workspaceId
        );
        const parsed = createUserSchema.safeParse(req.body);

        if (!parsed.success) {
            if (req.is("application/json")) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos." });
            return res.status(400).render("pages/admin/users/create", {
                user: req.user,
                error: parsed.error.issues[0]?.message || "Datos inválidos.",
                old: {
                    name: req.body.name || "",
                    email: req.body.email || "",
                    role: req.body.role || "AGENT",
                    manualMessageLimit: req.body.manualMessageLimit || "",
                    allowedNumberIds: Array.isArray(req.body.allowedNumberIds)
                        ? req.body.allowedNumberIds
                        : req.body.allowedNumberIds
                          ? [req.body.allowedNumberIds]
                          : []
                },
                numbers,
                suggestedPassword: UserService.suggestPassword()
            });
        }

        try {
            await UserService.createUser(req.user!.workspaceId, parsed.data);

            if (req.is("application/json")) return res.status(201).json({ ok: true });

            return res.redirect("/admin/users?success=created");
        } catch (error) {
            if (req.is("application/json")) return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo crear el usuario." });
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
                    manualMessageLimit: req.body.manualMessageLimit || "",
                    allowedNumberIds: Array.isArray(req.body.allowedNumberIds)
                        ? req.body.allowedNumberIds
                        : req.body.allowedNumberIds
                          ? [req.body.allowedNumberIds]
                          : []
                },
                numbers,
                suggestedPassword: UserService.suggestPassword()
            });
        }
    }

    static async showEdit(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            const [member, activeAdmins, numbers] = await Promise.all([
                UserService.getMemberById(req.user!.workspaceId, id),
                UserService.countActiveAdmins(req.user!.workspaceId),
                WhatsAppNumberService.listNumbers(req.user!.workspaceId)
            ]);

            if (wantsJson(req)) {
                return res.json({
                    member: {
                        id: member.id, name: member.name, email: member.email, role: member.role,
                        status: member.status, isActive: member.isActive,
                        canSendManualMessages: member.canSendManualMessages,
                        manualMessageLimit: member.manualMessageLimit,
                        allowedNumberIds: member.allowedNumberIds,
                        lockedUntil: member.lockedUntil,
                        twoFactorEnabledAt: member.twoFactorEnabledAt
                    },
                    numbers: safeNumbers(numbers), activeAdmins,
                    suggestedPassword: UserService.suggestPassword()
                });
            }

            return res.redirect(`/panel/admin/users/${encodeURIComponent(id)}`);

        } catch {
            if (wantsJson(req)) return res.status(404).json({ error: "No se encontró el usuario." });
            return res.redirect("/admin/users");
        }
    }

    static async update(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        const parsed = updateUserSchema.safeParse(req.body);

        if (!parsed.success) {
            if (req.is("application/json")) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos." });
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

            if (req.is("application/json")) return res.json({ ok: true });

            return res.redirect("/admin/users?success=updated");
        } catch (error) {
            if (req.is("application/json")) return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo actualizar." });
            return res.redirect(
                `/admin/users/${id}/edit?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo actualizar."
                )}`
            );
        }
    }

    static async remove(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            await UserService.deleteAgent(
                req.user!.workspaceId,
                id,
                req.user!.id
            );
        } catch (error) {
            if (req.is("application/json")) return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo eliminar al agente." });
            return res.redirect(
                `/admin/users?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo eliminar al agente."
                )}`
            );
        }

        if (req.is("application/json")) return res.json({ ok: true });

        return res.redirect("/admin/users?success=deleted");
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
            if (req.is("application/json")) return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo cambiar el estado." });
            return res.redirect(
                `/admin/users?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo cambiar el estado."
                )}`
            );
        }

        if (req.is("application/json")) return res.json({ ok: true });

        return res.redirect("/admin/users?success=status");
    }

    /**
     * Restablecer la contraseña de otra persona. La contraseña nueva la
     * escribe el administrador y quien la recibe debe cambiarla al entrar.
     */
    static async resetPassword(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        const rawPassword = req.body?.password;
        const parsed = resetPasswordSchema.safeParse({
            password:
                typeof rawPassword === "string" ? rawPassword.trim() : ""
        });

        if (!parsed.success) {
            if (req.is("application/json")) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Contraseña inválida." });
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
            if (req.is("application/json")) return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo restablecer." });
            return res.redirect(
                `/admin/users/${id}/edit?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo restablecer."
                )}`
            );
        }

        if (req.is("application/json")) return res.json({ ok: true });

        return res.redirect(
            `/panel/admin/users/${encodeURIComponent(id)}?success=password`
        );
    }

    /** Libera una cuenta bloqueada por intentos fallidos. */
    static async unlock(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            await UserService.unlock(req.user!.workspaceId, id, req.user!.id);
        } catch (error) {
            if (req.is("application/json")) return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo desbloquear." });
            return res.redirect(
                `/admin/users/${id}/edit?error=${encodeURIComponent(
                    error instanceof Error ? error.message : "No se pudo desbloquear."
                )}`
            );
        }

        if (req.is("application/json")) return res.json({ ok: true });

        return res.redirect(`/admin/users/${id}/edit?success=unlocked`);
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
            if (req.is("application/json")) return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo desactivar la verificación en dos pasos." });
            return res.redirect(
                `/admin/users/${id}/edit?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo desactivar la verificación en dos pasos."
                )}`
            );
        }

        if (req.is("application/json")) return res.json({ ok: true });

        return res.redirect(`/admin/users/${id}/edit?success=two-factor`);
    }
}

/**
 * Cambio de contraseña por la propia persona. Vive fuera de `/admin` y
 * `/agent` para que sea la misma pantalla para los dos roles.
 */
export class AccountController {
    static show(req: Request, res: Response) {
        if (wantsJson(req)) {
            return res.json({
                user: { name: req.user!.name, email: req.user!.email },
                required: req.query.required === "1",
                changed: req.query.changed === "1",
                closed: Number(req.query.closed) || 0
            });
        }
        const prefix = req.user!.role === "AGENT" ? "/panel/agent" : "/panel/admin";
        const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
        return res.redirect(`${prefix}/account/password${query}`);
    }

    /** Pantalla de seguridad: contraseña + verificación en dos pasos. */
    static async showSecurity(req: Request, res: Response) {
        const state = await UserService.twoFactorState(req.user!.id);
        let qr: string | null = null;

        /**
         * El código QR se dibuja solo si hay una activación en curso. Si el
         * enlace saliera demasiado largo (nombre de empresa y correo
         * enormes), se muestra la pantalla sin QR en lugar de fallar: la
         * clave de configuración sigue estando para capturarla a mano.
         */
        if (state.otpauthUrl) {
            try {
                qr = qrSvg(state.otpauthUrl, { size: 216 });
            } catch {
                qr = null;
            }
        }

        if (wantsJson(req)) {
            return res.json({
                user: { name: req.user!.name, email: req.user!.email },
                state: { enabled: state.enabled, pending: Boolean(state.pendingSecret) },
                qr,
                formattedSecret: state.pendingSecret ? formatSecretForHumans(state.pendingSecret) : null,
                otpauthUrl: state.otpauthUrl
            });
        }
        const prefix = req.user!.role === "AGENT" ? "/panel/agent" : "/panel/admin";
        return res.redirect(`${prefix}/account/security`);
    }

    /** Página de preferencias de notificación (sonido y navegador). */
    static async showNotifications(req: Request, res: Response) {
        const user = await prisma.user.findUniqueOrThrow({
            where: { id: req.user!.id },
            select: { notifySoundEnabled: true, notifyBrowserEnabled: true }
        });

        if (wantsJson(req)) {
            return res.json({
                user: { name: req.user!.name, email: req.user!.email },
                notifySoundEnabled: user.notifySoundEnabled,
                notifyBrowserEnabled: user.notifyBrowserEnabled
            });
        }
        const prefix = req.user!.role === "AGENT" ? "/panel/agent" : "/panel/admin";
        return res.redirect(`${prefix}/account/notifications`);
    }

    static async saveNotifications(req: Request, res: Response) {
        await prisma.user.update({
            where: { id: req.user!.id },
            data: {
                notifySoundEnabled: req.body?.notifySoundEnabled === "true" || req.body?.notifySoundEnabled === true,
                notifyBrowserEnabled: req.body?.notifyBrowserEnabled === "true" || req.body?.notifyBrowserEnabled === true
            }
        });

        if (req.is("application/json")) return res.json({ ok: true });
        return res.redirect("/account/notifications?success=saved");
    }

    /** Genera la clave y muestra la pantalla para confirmarla. */
    static async startTwoFactor(req: Request, res: Response) {
        try {
            await UserService.startTwoFactor(req.user!.id);
        } catch (error) {
            if (req.accepts("json") && !req.accepts("html")) return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo iniciar la activación." });
            return res.redirect(
                `/account/security?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo iniciar la activación."
                )}`
            );
        }

        if (req.accepts("json") && !req.accepts("html")) return res.json({ ok: true });
        return res.redirect("/account/security");
    }

    static async confirmTwoFactor(req: Request, res: Response) {
        const parsed = twoFactorCodeSchema.safeParse(req.body);

        if (!parsed.success) {
            if (req.is("application/json")) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Código inválido." });
            return res.redirect(
                `/account/security?error=${encodeURIComponent(
                    parsed.error.issues[0]?.message || "Código inválido."
                )}`
            );
        }

        try {
            await UserService.confirmTwoFactor(req.user!.id, parsed.data.code);
        } catch (error) {
            if (req.accepts("json") && !req.accepts("html")) return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo confirmar el código." });
            return res.redirect(
                `/account/security?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo confirmar el código."
                )}`
            );
        }

        if (req.accepts("json") && !req.accepts("html")) return res.json({ ok: true });
        return res.redirect("/account/security?success=enabled");
    }

    static async disableTwoFactor(req: Request, res: Response) {
        const parsed = twoFactorCodeSchema.safeParse(req.body);

        if (!parsed.success) {
            if (req.is("application/json")) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Código inválido." });
            return res.redirect(
                `/account/security?error=${encodeURIComponent(
                    parsed.error.issues[0]?.message || "Código inválido."
                )}`
            );
        }

        try {
            await UserService.disableTwoFactor(req.user!.id, parsed.data.code);
        } catch (error) {
            if (req.accepts("json") && !req.accepts("html")) return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo desactivar." });
            return res.redirect(
                `/account/security?error=${encodeURIComponent(
                    error instanceof Error
                        ? error.message
                        : "No se pudo desactivar."
                )}`
            );
        }

        if (req.accepts("json") && !req.accepts("html")) return res.json({ ok: true });
        return res.redirect("/account/security?success=disabled");
    }

    /** Descartar una activación que nunca se confirmó. */
    static async cancelTwoFactor(req: Request, res: Response) {
        await UserService.cancelTwoFactor(req.user!.id);

        if (req.accepts("json") && !req.accepts("html")) return res.json({ ok: true });

        return res.redirect("/account/security?success=cancelled");
    }

    static async change(req: Request, res: Response) {
        const parsed = changePasswordSchema.safeParse(req.body);

        if (!parsed.success) {
            if (req.is("application/json")) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos." });
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

            if (req.is("application/json")) return res.json({ ok: true, otherSessionsClosed: result.otherSessionsClosed });

            return res.redirect(
                `/account/password?changed=1&closed=${result.otherSessionsClosed}`
            );
        } catch (error) {
            if (req.is("application/json")) return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo cambiar la contraseña." });
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
