import { NextFunction, Request, Response } from "express";
import { WorkspaceStatus } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { userToAuthUser, verifyAuthToken } from "../utils/jwt";

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

        return next();
    } catch {
        res.clearCookie(appConfig.cookieName);
        return res.redirect("/auth/login");
    }
}
