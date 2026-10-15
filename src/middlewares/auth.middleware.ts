import { NextFunction, Request, Response } from "express";
import { WorkspaceStatus } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { userToAuthUser, verifyAuthToken } from "../utils/jwt";
import { SessionService } from "../services/session.service";

export async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const token = req.cookies?.[appConfig.cookieName];

        if (!token) {
            return res.redirect("/auth/login");
        }

        const payload = verifyAuthToken(token);

        const session = await prisma.userSession.findUnique({
            where: {
                tokenId: payload.tokenId
            },
            include: {
                user: {
                    include: {
                        workspace: true
                    }
                }
            }
        });

        if (!session || !session.isActive) {
            res.clearCookie(appConfig.cookieName);
            return res.redirect("/auth/login");
        }

        if (session.expiresAt < new Date()) {
            await prisma.userSession.update({
                where: {
                    id: session.id
                },
                data: {
                    isActive: false
                }
            });

            res.clearCookie(appConfig.cookieName);
            return res.redirect("/auth/login");
        }

        /**
         * Cierre por inactividad: una sesión abandonada no debe seguir viva
         * solo porque la cookie no expiró.
         */
        if (SessionService.isIdle(session)) {
            await prisma.userSession.update({
                where: {
                    id: session.id
                },
                data: {
                    isActive: false
                }
            });

            res.clearCookie(appConfig.cookieName);

            return res.redirect("/auth/login?error=idle");
        }

        if (!session.user.isActive) {
            res.clearCookie(appConfig.cookieName);
            return res.redirect("/auth/login");
        }

        if (session.user.workspace.status !== WorkspaceStatus.ACTIVE) {
            res.clearCookie(appConfig.cookieName);
            return res.redirect("/auth/login?error=workspace_suspended");
        }

        await prisma.userSession.update({
            where: {
                id: session.id
            },
            data: {
                lastSeenAt: new Date()
            }
        });

        req.user = userToAuthUser(session.user);
        req.tokenId = session.tokenId;

        /**
         * Si un administrador restableció la contraseña de esta persona, no
         * se la dejamos usar sin cambiarla: así el administrador no conserva
         * la contraseña con la que alguien entra a trabajar.
         */
        if (session.user.mustChangePassword) {
            const path = req.originalUrl;
            const canPass =
                path.startsWith("/account/password") ||
                path.startsWith("/auth/logout");

            if (!canPass) {
                return res.redirect("/account/password?required=1");
            }
        }

        return next();
    } catch {
        res.clearCookie(appConfig.cookieName);
        return res.redirect("/auth/login");
    }
}
