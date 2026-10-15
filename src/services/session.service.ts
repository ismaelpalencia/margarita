import { LogLevel, LogModule } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { describeDevice } from "../utils/user-agent";
import { isSessionIdle } from "../utils/session";
import { LogService } from "./log.service";

export type SessionView = {
    id: string;
    tokenId: string;
    userId: string;
    userName: string;
    userEmail: string;
    role: string;
    device: string;
    ip: string | null;
    createdAt: Date;
    lastSeenAt: Date | null;
    expiresAt: Date;
    isCurrent: boolean;
};

/**
 * Sesiones activas.
 *
 * Tres controles, en este orden de utilidad:
 *
 * 1. **Cierre por inactividad** (`SESSION_IDLE_MINUTES`): si nadie usa la
 *    sesión en ese tiempo, se revoca aunque la cookie siga viva.
 * 2. **Tope de dispositivos** (`SESSION_MAX_ACTIVE`): al iniciar sesión en
 *    uno más, se cierra la más vieja. Así una contraseña filtrada no deja
 *    sesiones abiertas indefinidamente en equipos ajenos.
 * 3. **Lista visible y revocable**: cada quien puede ver sus sesiones y
 *    cerrarlas; el admin ve las de toda su empresa.
 *
 * Lo que **no** se hace es atar la sesión a una IP: en datos móviles y en
 * redes de oficina con salida compartida la IP cambia sola durante el día, y
 * la sesión se caería sin motivo. La IP se guarda y se muestra para que la
 * persona reconozca lo que no es suyo.
 */
export class SessionService {
    static idleLimitMs(): number {
        return appConfig.sessionIdleMinutes * 60 * 1000;
    }

    /**
     * ¿La sesión lleva demasiado tiempo sin usarse? Se toma `lastSeenAt` y,
     * si no hay, la fecha de creación.
     */
    static isIdle(
        session: { lastSeenAt: Date | null; createdAt: Date },
        now = new Date()
    ): boolean {
        return isSessionIdle(session, this.idleLimitMs(), now);
    }

    static async listForUser(
        userId: string,
        currentTokenId?: string
    ): Promise<SessionView[]> {
        const sessions = await prisma.userSession.findMany({
            where: {
                userId,
                isActive: true,
                expiresAt: {
                    gt: new Date()
                }
            },
            orderBy: {
                lastSeenAt: "desc"
            },
            include: {
                user: {
                    select: {
                        name: true,
                        email: true,
                        role: true
                    }
                }
            }
        });

        return sessions
            .filter((session) => !this.isIdle(session))
            .map((session) => this.toView(session, currentTokenId));
    }

    /** Para el admin: todas las sesiones activas de la empresa. */
    static async listForWorkspace(
        workspaceId: string,
        currentTokenId?: string
    ): Promise<SessionView[]> {
        const sessions = await prisma.userSession.findMany({
            where: {
                isActive: true,
                expiresAt: {
                    gt: new Date()
                },
                user: {
                    workspaceId
                }
            },
            orderBy: [
                {
                    lastSeenAt: "desc"
                }
            ],
            include: {
                user: {
                    select: {
                        name: true,
                        email: true,
                        role: true
                    }
                }
            }
        });

        return sessions
            .filter((session) => !this.isIdle(session))
            .map((session) => this.toView(session, currentTokenId));
    }

    private static toView(
        session: {
            id: string;
            tokenId: string;
            userId: string;
            ip: string | null;
            userAgent: string | null;
            createdAt: Date;
            lastSeenAt: Date | null;
            expiresAt: Date;
            user: { name: string; email: string; role: string };
        },
        currentTokenId?: string
    ): SessionView {
        return {
            id: session.id,
            tokenId: session.tokenId,
            userId: session.userId,
            userName: session.user.name,
            userEmail: session.user.email,
            role: session.user.role,
            device: describeDevice(session.userAgent),
            /** `::ffff:127.0.0.1` es una IPv4 envuelta: se muestra normal. */
            ip: session.ip?.startsWith("::ffff:")
                ? session.ip.slice(7)
                : session.ip,
            createdAt: session.createdAt,
            lastSeenAt: session.lastSeenAt,
            expiresAt: session.expiresAt,
            isCurrent: Boolean(
                currentTokenId && session.tokenId === currentTokenId
            )
        };
    }

    /** Cierra una sesión. Sin `userId` solo se permite desde el admin. */
    static async revoke(
        tokenId: string,
        options: { userId?: string } = {}
    ): Promise<number> {
        const result = await prisma.userSession.updateMany({
            where: {
                tokenId,
                isActive: true,
                ...(options.userId ? { userId: options.userId } : {})
            },
            data: {
                isActive: false
            }
        });

        return result.count;
    }

    /** Cierra todas las sesiones del usuario menos la que está en uso. */
    static async revokeOthers(
        userId: string,
        keepTokenId: string
    ): Promise<number> {
        const result = await prisma.userSession.updateMany({
            where: {
                userId,
                isActive: true,
                tokenId: {
                    not: keepTokenId
                }
            },
            data: {
                isActive: false
            }
        });

        return result.count;
    }

    /**
     * Deja cuando mucho `SESSION_MAX_ACTIVE` sesiones abiertas, cerrando las
     * más viejas. Se llama al iniciar sesión.
     */
    static async enforceLimit(
        userId: string,
        workspaceId: string
    ): Promise<number> {
        const limit = appConfig.maxActiveSessions;

        if (!limit || limit < 1) {
            return 0;
        }

        const sessions = await prisma.userSession.findMany({
            where: {
                userId,
                isActive: true,
                expiresAt: {
                    gt: new Date()
                }
            },
            orderBy: {
                lastSeenAt: "desc"
            },
            select: {
                tokenId: true
            }
        });

        const excess = sessions.slice(limit);

        if (excess.length === 0) {
            return 0;
        }

        await prisma.userSession.updateMany({
            where: {
                tokenId: {
                    in: excess.map((session) => session.tokenId)
                }
            },
            data: {
                isActive: false
            }
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.WARN,
            module: LogModule.AUTH,
            action: "SESSION_LIMIT_ENFORCED",
            message: `Se cerraron ${excess.length} sesión(es) antigua(s): el tope es ${limit} dispositivos.`,
            payload: {
                userId,
                closed: excess.length,
                limit
            }
        });

        return excess.length;
    }

    /** Limpieza: marca inactivas las sesiones vencidas o abandonadas. */
    static async purgeStale(): Promise<number> {
        const now = new Date();
        const idleCutoff = new Date(now.getTime() - this.idleLimitMs());

        const result = await prisma.userSession.updateMany({
            where: {
                isActive: true,
                OR: [
                    { expiresAt: { lt: now } },
                    {
                        lastSeenAt: { lt: idleCutoff },
                        createdAt: { lt: idleCutoff }
                    }
                ]
            },
            data: {
                isActive: false
            }
        });

        return result.count;
    }
}
