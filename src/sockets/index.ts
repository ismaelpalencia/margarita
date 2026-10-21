import type { Server as HttpServer } from "node:http";

import { UserRole, UserStatus, WorkspaceStatus } from "@prisma/client";
import { Server as SocketServer } from "socket.io";

import { appConfig } from "../config/app.config";
import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { verifyAuthToken } from "../utils/jwt";

export type LiveMessage = {
    id: string;
    wamid: string | null;
    direction: "IN" | "OUT";
    type: string;
    status: string;
    source: string;
    body: string | null;
    createdAt: string;
};

export type LiveConversationEvent = {
    conversationId: string;
    assignedUserId: string | null;
    contact: {
        id: string;
        name: string;
        phone: string;
    };
    message: LiveMessage;
};

let io: SocketServer | null = null;

function workspaceRoom(workspaceId: string): string {
    return `workspace:${workspaceId}`;
}

function userRoom(userId: string): string {
    return `user:${userId}`;
}

function parseCookies(cookieHeader: string | undefined): Map<string, string> {
    const cookies = new Map<string, string>();

    if (!cookieHeader) {
        return cookies;
    }

    for (const part of cookieHeader.split(";")) {
        const separatorIndex = part.indexOf("=");

        if (separatorIndex === -1) {
            continue;
        }

        const name = part.slice(0, separatorIndex).trim();
        const value = part.slice(separatorIndex + 1).trim();

        if (name) {
            cookies.set(name, decodeURIComponent(value));
        }
    }

    return cookies;
}

export function initSocket(server: HttpServer): SocketServer {
    io = new SocketServer(server, {
        cors: {
            origin: appConfig.appUrl,
            credentials: true
        }
    });

    /**
     * Reutilizamos la misma cookie/JWT del panel, así el socket hereda
     * el workspace y el rol sin exponer un token aparte.
     */
    io.use(async (socket, next) => {
        try {
            const cookies = parseCookies(socket.handshake.headers.cookie);
            const token = cookies.get(appConfig.cookieName);

            if (!token) {
                return next(new Error("NO_SESSION"));
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

            if (
                !session ||
                !session.isActive ||
                session.expiresAt < new Date() ||
                !session.user.isActive ||
                session.user.workspace.status !== WorkspaceStatus.ACTIVE
            ) {
                return next(new Error("INVALID_SESSION"));
            }

            socket.data.user = {
                id: session.user.id,
                workspaceId: session.user.workspaceId,
                role: session.user.role as UserRole,
                name: session.user.name,
                status: session.user.status as UserStatus
            };

            return next();
        } catch {
            return next(new Error("INVALID_SESSION"));
        }
    });

    io.on("connection", (socket) => {
        const user = socket.data.user as
            | { id: string; workspaceId: string; role: string; name: string }
            | undefined;

        if (!user) {
            socket.disconnect(true);
            return;
        }

        if (user.role === UserRole.ADMIN) {
            socket.join(workspaceRoom(user.workspaceId));
        } else {
            socket.join(userRoom(user.id));
        }

        logger.debug(
            {
                socketId: socket.id,
                userId: user.id,
                workspaceId: user.workspaceId
            },
            "Cliente en tiempo real conectado"
        );
    });

    return io;
}

export function emitToWorkspace(
    workspaceId: string,
    event: string,
    payload: unknown
) {
    if (!io) {
        return;
    }

    io.to(workspaceRoom(workspaceId)).emit(event, payload);
}

/**
 * Send conversation data to workspace administrators and only the agents
 * whose access is affected by the conversation. Agent filtering must happen
 * on the server; browser-side filtering does not protect event payloads.
 */
export function emitToWorkspaceAndUsers(
    workspaceId: string,
    userIds: Array<string | null | undefined>,
    event: string,
    payload: unknown
) {
    if (!io) {
        return;
    }

    const rooms = [
        workspaceRoom(workspaceId),
        ...new Set(userIds.filter((id): id is string => Boolean(id)).map(userRoom))
    ];

    io.to(rooms).emit(event, payload);
}
