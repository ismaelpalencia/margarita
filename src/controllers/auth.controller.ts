import { Request, Response } from "express";
import { UserRole } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { AuthService } from "../services/auth.service";
import { loginSchema } from "../validations/auth.validation";
import { SetupService } from "../services/setup.service";

export class AuthController {
    static async showLogin(req: Request, res: Response) {
        /**
         * Si la instalación todavía no tiene empresa ni administrador, se
         * avisa aquí: quien llegue al login de un despliegue nuevo tiene que
         * pasar por el asistente, no adivinar que existe.
         */
        const notConfigured = await SetupService.isConfigured()
            .then((configured) => !configured)
            .catch(() => false);

        const error = req.query.error;
        const success = req.query.success;

        let message: string | null = null;

        if (error === "workspace_suspended") {
            message = "El servicio de tu empresa está suspendido.";
        } else if (error === "idle") {
            message =
                `Tu sesión se cerró por inactividad (${Math.round(
                    appConfig.sessionIdleMinutes / 60
                )} horas sin usarla). Vuelve a entrar.`;
        } else if (error === "revoked") {
            message = "Esa sesión se cerró desde el panel de sesiones.";
        }

        return res.render("pages/auth/login", {
            appName: appConfig.name,
            notConfigured,
            error: message,
            success:
                success === "setup"
                    ? "Instalación creada. Entra con el correo y la contraseña que registraste."
                    : null,
            old: {
                email:
                    typeof req.query.email === "string" ? req.query.email : ""
            }
        });
    }

    static async login(req: Request, res: Response) {
        try {
            const parsed = loginSchema.safeParse(req.body);

            if (!parsed.success) {
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
                return res.redirect("/admin/dashboard");
            }

            return res.redirect("/agent/dashboard");
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "No se pudo iniciar sesión.";

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
                return res.redirect("/admin/dashboard");
            }

            return res.redirect("/agent/dashboard");
        } catch (error) {
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
