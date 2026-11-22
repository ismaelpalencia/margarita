import { Request, Response } from "express";
import { UserRole } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { AuthService } from "../services/auth.service";
import { loginSchema } from "../validations/auth.validation";
import { SetupService } from "../services/setup.service";
import { prisma } from "../config/prisma";
import { verifyAuthToken } from "../utils/jwt";
import { SessionService } from "../services/session.service";

export class AuthController {
    static async loginMeta(req: Request, res: Response) {
        const notConfigured = await SetupService.isConfigured()
            .then((configured) => !configured)
            .catch(() => false);
        const error = typeof req.query.error === "string" ? req.query.error : "";
        const messages: Record<string, string> = {
            workspace_suspended: "El servicio de tu empresa está suspendido.",
            idle: `Tu sesión se cerró por inactividad (${Math.round(appConfig.sessionIdleMinutes / 60)} horas sin usarla). Vuelve a entrar.`,
            revoked: "Esa sesión se cerró desde el panel de sesiones."
        };

        return res.json({
            notConfigured,
            error: messages[error] || null,
            success:
                req.query.success === "setup"
                    ? "Instalación creada. Entra con el correo y la contraseña que registraste."
                    : null,
            email: typeof req.query.email === "string" ? req.query.email : ""
        });
    }

    static async showLogin(req: Request, res: Response) {
        /**
         * Si ya hay una sesión válida, no se vuelve a pedir la contraseña:
         * al abrir el navegador se entra directo al panel. Antes, el login
         * siempre pintaba el formulario aunque la cookie siguiera viva.
         */
        const token = req.cookies?.[appConfig.cookieName];

        if (token) {
            try {
                const payload = verifyAuthToken(token);
                const session = await prisma.userSession.findUnique({
                    where: { tokenId: payload.tokenId },
                    include: { user: true }
                });

                if (
                    session &&
                    session.isActive &&
                    session.expiresAt > new Date() &&
                    !SessionService.isIdle(session) &&
                    session.user.isActive
                ) {
                    /** Si debe cambiar la contraseña, eso va primero. */
                    if (session.user.mustChangePassword) {
                        return res.redirect("/account/password");
                    }

                    return res.redirect(
                        session.user.role === UserRole.ADMIN
                            ? "/admin/dashboard"
                            : "/agent/dashboard"
                    );
                }
            } catch {
                /** Cookie vencida o firma inválida: sigue el formulario. */
            }
        }

        return res.redirect(`/panel/login${req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : ""}`);
    }

    static async login(req: Request, res: Response) {
        try {
            const parsed = loginSchema.safeParse(req.body);

            if (!parsed.success) {
                if (req.accepts("json")) {
                    return res.status(400).json({
                        error: parsed.error.issues[0]?.message || "Datos inválidos."
                    });
                }

                return res.status(400).render("pages/auth/login", {
                    appName: appConfig.name,
                    error: parsed.error.issues[0]?.message || "Datos inválidos.",
                    old: {
                        email: req.body.email || ""
                    }
                });
            }

            const result = await AuthService.login(parsed.data, {
                ip: req.ip,
                userAgent: req.get("user-agent")
            });

            /**
             * La cuenta tiene verificación en dos pasos: la contraseña fue
             * correcta, pero todavía no hay sesión. Se pide el código.
             */
            if ("twoFactorRequired" in result) {
                if (req.accepts("json")) {
                    return res.json({
                        twoFactorRequired: true,
                        challengeToken: result.challengeToken,
                        email: parsed.data.email
                    });
                }

                return res.render("pages/auth/login", {
                    appName: appConfig.name,
                    notConfigured: false,
                    error: null,
                    success: null,
                    twoFactor: {
                        challengeToken: result.challengeToken,
                        email: parsed.data.email
                    },
                    old: { email: parsed.data.email }
                });
            }

            res.cookie(appConfig.cookieName, result.token, {
                  httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            if (result.user.role === UserRole.ADMIN) {
                if (req.accepts("json")) {
                    return res.json({ ok: true, redirectUrl: "/admin/dashboard" });
                }
                return res.redirect("/admin/dashboard");
            }

            if (req.accepts("json")) {
                return res.json({ ok: true, redirectUrl: "/agent/dashboard" });
            }
            return res.redirect("/agent/dashboard");
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "No se pudo iniciar sesión.";

            if (req.accepts("json")) {
                return res.status(400).json({ error: message });
            }

            return res.status(400).render("pages/auth/login", {
                appName: appConfig.name,
                error: message,
                old: {
                    email: req.body.email || ""
                }
            });
        }
    }

    /** Segundo paso: el código de la app de autenticación. */
    static async verifyTwoFactor(req: Request, res: Response) {
        const challengeToken =
            typeof req.body?.challengeToken === "string"
                ? req.body.challengeToken
                : "";
        const code = typeof req.body?.code === "string" ? req.body.code : "";
        const email =
            typeof req.body?.email === "string" ? req.body.email : "";

        try {
            const result = await AuthService.verifyTwoFactor(
                { challengeToken, code },
                { ip: req.ip, userAgent: req.get("user-agent") }
            );

            res.cookie(appConfig.cookieName, result.token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000
            });

            if (result.user.role === UserRole.ADMIN) {
                if (req.accepts("json")) {
                    return res.json({ ok: true, redirectUrl: "/admin/dashboard" });
                }
                return res.redirect("/admin/dashboard");
            }

            if (req.accepts("json")) {
                return res.json({ ok: true, redirectUrl: "/agent/dashboard" });
            }
            return res.redirect("/agent/dashboard");
        } catch (error) {
            if (req.accepts("json")) {
                return res.status(400).json({
                    error:
                        error instanceof Error
                            ? error.message
                            : "No se pudo verificar el código.",
                    twoFactorRequired: true,
                    challengeToken,
                    email
                });
            }

            return res.status(400).render("pages/auth/login", {
                appName: appConfig.name,
                notConfigured: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "No se pudo verificar el código.",
                success: null,
                twoFactor: { challengeToken, email },
                old: { email }
            });
        }
    }

    static async logout(req: Request, res: Response) {
        if (req.user && req.tokenId) {
            await AuthService.logout(req.tokenId, req.user.id);
        }

        res.clearCookie(appConfig.cookieName, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax"
        });

        return res.redirect("/auth/login");
    }
}
