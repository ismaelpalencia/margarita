import crypto from "node:crypto";

import bcrypt from "bcrypt";
import { UserRole, UserStatus, WorkspaceStatus } from "@prisma/client";

import { prisma } from "../config/prisma";
import { LoginInput } from "../validations/auth.validation";
import { getSessionExpiresAt } from "../utils/session";
import { signAuthToken } from "../utils/jwt";

type LoginContext = {
    ip?: string;
    userAgent?: string;
};

export class AuthService {
    static async login(input: LoginInput, context: LoginContext) {
        const user = await prisma.user.findUnique({
            where: {
                email: input.email
            },
            include: {
                workspace: true
            }
        });

        if (!user) {
            throw new Error("Credenciales incorrectas.");
        }

        if (!user.isActive) {
            throw new Error("Tu usuario está desactivado. Contacta a tu administrador.");
        }

        if (user.workspace.status !== WorkspaceStatus.ACTIVE) {
            throw new Error("El servicio de tu empresa está suspendido.");
        }

        const passwordIsValid = await bcrypt.compare(input.password, user.password);

        if (!passwordIsValid) {
            throw new Error("Credenciales incorrectas.");
        }

        const tokenId = crypto.randomUUID();
        const expiresAt = getSessionExpiresAt();

        await prisma.userSession.create({
            data: {
                userId: user.id,
                tokenId,
                ip: context.ip,
                userAgent: context.userAgent,
                expiresAt,
                isActive: true,
                lastSeenAt: new Date()
            }
        });

        await prisma.user.update({
            where: {
                id: user.id
            },
            data: {
                lastLoginAt: new Date(),
                status: user.role === UserRole.AGENT ? UserStatus.OFFLINE : user.status
            }
        });

        const token = signAuthToken({
            sub: user.id,
            tokenId,
            workspaceId: user.workspaceId,
            role: user.role
        });

        return {
            token,
            user: {
                id: user.id,
                workspaceId: user.workspaceId,
                name: user.name,
                email: user.email,
                role: user.role
            }
        };
    }

    static async logout(tokenId: string, userId: string) {
        await prisma.userSession.updateMany({
            where: {
                tokenId,
                userId,
                isActive: true
            },
            data: {
                isActive: false
            }
        });

        const user = await prisma.user.findUnique({
            where: {
                id: userId
            }
        });

        if (user?.role === UserRole.AGENT) {
            await prisma.user.update({
                where: {
                    id: userId
                },
                data: {
                    status: UserStatus.OFFLINE
                }
            });
        }
    }
}
