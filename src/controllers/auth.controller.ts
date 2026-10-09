import { Request, Response } from "express";
import { UserRole } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { AuthService } from "../services/auth.service";
import { loginSchema } from "../validations/auth.validation";

export class AuthController {
    static showLogin(req: Request, res: Response) {
        const error = req.query.error;

        let message: string | null = null;

        if (error === "workspace_suspended") {
            message = "El servicio de tu empresa está suspendido.";
        }

        return res.render("pages/auth/login", {
            appName: appConfig.name,
            error: message,
            old: {
                email: ""
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
