import { NextFunction, Request, Response } from "express";

import { SessionService } from "../services/session.service";
import { LogLevel, LogModule } from "@prisma/client";
import { LogService } from "../services/log.service";
import { appConfig } from "../config/app.config";
import { formatDateTimeMX } from "../utils/date";

/**
 * Sesiones activas. El admin ve las de toda la empresa y puede cerrar
 * cualquiera; cada persona puede cerrar las suyas y "todas las demás".
 */
export class SessionsController {
    static adminIndex = async (req: Request, res: Response) => {
        const sessions = await SessionService.listForWorkspace(
            req.user!.workspaceId,
            req.tokenId
        );

        return res.render("pages/admin/sessions/index", {
            user: req.user,
            sessions,
            idleHours: Math.round(SessionService.idleLimitMs() / 3600000),
            maxActive: appConfig.maxActiveSessions,
            formatDateTimeMX,
            success: req.query.success || null,
            error: req.query.error || null
        });
    };

    static agentIndex = async (req: Request, res: Response) => {
        const sessions = await SessionService.listForUser(
            req.user!.id,
            req.tokenId
        );

        return res.render("pages/agent/sessions/index", {
            user: req.user,
            sessions,
            idleHours: Math.round(SessionService.idleLimitMs() / 3600000),
            maxActive: appConfig.maxActiveSessions,
            formatDateTimeMX,
            success: req.query.success || null,
            error: req.query.error || null
        });
    };

    /** Cerrar una sesión concreta. */
    static revoke = async (
        req: Request,
        res: Response,
        next: NextFunction
    ) => {
        const tokenId =
            typeof req.body?.tokenId === "string" ? req.body.tokenId : "";
        const basePath = req.baseUrl.includes("/agent")
            ? "/agent/sessions"
            : "/admin/sessions";
        const forAdmin = basePath.startsWith("/admin");

        if (!tokenId) {
            return res.redirect(`${basePath}?error=revoke`);
        }

        if (tokenId === req.tokenId) {
            /** Cerrar la propia sesión es salir, y eso ya tiene su botón. */
            return res.redirect(`${basePath}?error=current`);
        }

        try {
            const closed = await SessionService.revoke(
                tokenId,
                forAdmin ? {} : { userId: req.user!.id }
            );

            if (closed > 0) {
                await LogService.create({
                    workspaceId: req.user!.workspaceId,
                    level: LogLevel.WARN,
                    module: LogModule.AUTH,
                    action: "SESSION_REVOKED",
                    message:
                        "Se cerró una sesión desde el panel de sesiones.",
                    payload: {
                        tokenId,
                        by: req.user!.id
                    }
                });
            }

            return res.redirect(`${basePath}?success=revoked`);
        } catch (error) {
            return next(error);
        }
    };

    /** Cerrar todas las sesiones propias menos la actual. */
    static revokeOthers = async (req: Request, res: Response) => {
        const basePath = req.baseUrl.includes("/agent")
            ? "/agent/sessions"
            : "/admin/sessions";

        const closed = await SessionService.revokeOthers(
            req.user!.id,
            req.tokenId!
        );

        if (closed > 0) {
            await LogService.create({
                workspaceId: req.user!.workspaceId,
                level: LogLevel.WARN,
                module: LogModule.AUTH,
                action: "SESSION_REVOKED_OTHERS",
                message: `Se cerraron ${closed} sesión(es) propia(s) desde el panel de sesiones.`,
                payload: {
                    closed,
                    by: req.user!.id
                }
            });
        }

        return res.redirect(`${basePath}?success=revoked-others`);
    };
}
