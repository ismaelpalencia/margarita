import crypto from "node:crypto";

import bcrypt from "bcrypt";
import { UserRole, UserStatus, WorkspaceStatus } from "@prisma/client";

import { prisma } from "../config/prisma";
import { appConfig } from "../config/app.config";
import { LoginInput } from "../validations/auth.validation";
import { getSessionExpiresAt } from "../utils/session";
import { signAuthToken, signTwoFactorChallenge, verifyTwoFactorChallenge } from "../utils/jwt";
import { LogLevel, LogModule } from "@prisma/client";
import { LogService } from "./log.service";
import { SessionService } from "./session.service";
import { verifyTotp } from "../utils/totp";

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
            await LogService.create({
                level: LogLevel.WARN,
                module: LogModule.AUTH,
                action: "LOGIN_FAILED",
                message: "Intento de acceso con un correo no registrado.",
                payload: {
                    email: input.email,
                    ip: context.ip,
                    reason: "USER_NOT_FOUND"
                }
            });

            throw new Error("Credenciales incorrectas.");
        }

        const now = new Date();

        if (user.lockedUntil && user.lockedUntil > now) {
            const minutes = Math.max(
                1,
                Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000)
            );

            await LogService.create({
                workspaceId: user.workspaceId,
                level: LogLevel.WARN,
                module: LogModule.AUTH,
                action: "LOGIN_BLOCKED",
                message: "Acceso bloqueado temporalmente por intentos fallidos.",
                payload: {
                    userId: user.id,
                    ip: context.ip,
                    lockedUntil: user.lockedUntil
                }
            });

            throw new Error(
                `Demasiados intentos fallidos. Intenta de nuevo en ${minutes} minuto(s).`
            );
        }

        if (!user.isActive) {
            throw new Error("Tu usuario está desactivado. Contacta a tu administrador.");
        }

        if (user.workspace.status !== WorkspaceStatus.ACTIVE) {
            throw new Error("El servicio de tu empresa está suspendido.");
        }

        const passwordIsValid = await bcrypt.compare(input.password, user.password);

        if (!passwordIsValid) {
            const attempts = user.failedLoginAttempts + 1;
            const shouldLock = attempts >= appConfig.loginMaxAttempts;

            await prisma.user.update({
                where: {
                    id: user.id
                },
                data: shouldLock
                    ? {
                          failedLoginAttempts: 0,
                          lockedUntil: new Date(
                              Date.now() + appConfig.loginLockMinutes * 60 * 1000
                          )
                      }
                    : {
                          failedLoginAttempts: attempts
                      }
            });

            await LogService.create({
                workspaceId: user.workspaceId,
                level: LogLevel.WARN,
                module: LogModule.AUTH,
                action: shouldLock ? "LOGIN_LOCKED" : "LOGIN_FAILED",
                message: shouldLock
                    ? "Cuenta bloqueada temporalmente por intentos fallidos."
                    : "Contraseña incorrecta.",
                payload: {
                    userId: user.id,
                    email: user.email,
                    ip: context.ip,
                    attempts,
                    maxAttempts: appConfig.loginMaxAttempts,
                    lockMinutes: shouldLock
                        ? appConfig.loginLockMinutes
                        : undefined
                }
            });

            if (shouldLock) {
                throw new Error(
                    `Demasiados intentos fallidos. La cuenta quedó bloqueada ${appConfig.loginLockMinutes} minuto(s).`
                );
            }

            throw new Error("Credenciales incorrectas.");
        }

        /**
         * Segundo paso: si la cuenta tiene verificación en dos pasos, la
         * contraseña correcta no abre sesión. Se entrega un desafío temporal
         * y la sesión se crea solo cuando el código es válido.
         */
        if (user.twoFactorEnabledAt && user.twoFactorSecret) {
            await LogService.create({
                workspaceId: user.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.AUTH,
                action: "LOGIN_2FA_REQUIRED",
                message: "Contraseña correcta; se pidió el código de verificación.",
                payload: {
                    userId: user.id,
                    email: user.email,
                    ip: context.ip
                }
            });

            return {
                twoFactorRequired: true as const,
                challengeToken: signTwoFactorChallenge(user.id)
            };
        }

        return this.startSession(user, context, { twoFactor: false });
    }

    /**
     * Segundo paso del acceso: valida el código de la app de autenticación y,
     * solo entonces, abre la sesión.
     *
     * Los códigos fallidos cuentan igual que una contraseña fallida, así que
     * la cuenta se bloquea tras varios intentos: sin eso, seis dígitos serían
     * adivinables con paciencia.
     */
    static async verifyTwoFactor(
        params: { challengeToken: string; code: string },
        context: LoginContext
    ) {
        let userId: string;

        try {
            userId = verifyTwoFactorChallenge(params.challengeToken);
        } catch {
            throw new Error(
                "El paso de verificación expiró. Vuelve a escribir tu contraseña."
            );
        }

        const user = await prisma.user.findUnique({
            where: {
                id: userId
            },
            include: {
                workspace: true
            }
        });

        if (!user || !user.isActive) {
            throw new Error("Credenciales incorrectas.");
        }

        const now = new Date();

        if (user.lockedUntil && user.lockedUntil > now) {
            const minutes = Math.max(
                1,
                Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000)
            );

            throw new Error(
                `Demasiados intentos fallidos. Intenta de nuevo en ${minutes} minuto(s).`
            );
        }

        if (!user.twoFactorEnabledAt || !user.twoFactorSecret) {
            /** La desactivaron entre el primer paso y este. */
            return this.startSession(user, context, { twoFactor: false });
        }

        const valid = verifyTotp(user.twoFactorSecret, params.code);

        if (!valid) {
            const attempts = user.failedLoginAttempts + 1;
            const shouldLock = attempts >= appConfig.loginMaxAttempts;

            await prisma.user.update({
                where: { id: user.id },
                data: shouldLock
                    ? {
                          failedLoginAttempts: 0,
                          lockedUntil: new Date(
                              Date.now() + appConfig.loginLockMinutes * 60 * 1000
                          )
                      }
                    : { failedLoginAttempts: attempts }
            });

            await LogService.create({
                workspaceId: user.workspaceId,
                level: LogLevel.WARN,
                module: LogModule.AUTH,
                action: shouldLock ? "LOGIN_LOCKED" : "LOGIN_2FA_FAILED",
                message: shouldLock
                    ? "Cuenta bloqueada tras varios códigos de verificación incorrectos."
                    : "Código de verificación incorrecto.",
                payload: {
                    userId: user.id,
                    email: user.email,
                    ip: context.ip,
                    attempts,
                    maxAttempts: appConfig.loginMaxAttempts
                }
            });

            throw new Error(
                shouldLock
                    ? `Demasiados códigos incorrectos. La cuenta quedó bloqueada ${appConfig.loginLockMinutes} minuto(s).`
                    : "El código no es correcto. Revisa la app de autenticación."
            );
        }

        return this.startSession(user, context, { twoFactor: true });
    }

    /**
     * Abre la sesión: crea el registro, aplica el tope de dispositivos,
     * actualiza el último acceso y deja la constancia en la bitácora.
     */
    private static async startSession(
        user: {
            id: string;
            workspaceId: string;
            name: string;
            email: string;
            role: UserRole;
            status: UserStatus;
        },
        context: LoginContext,
        options: { twoFactor: boolean }
    ) {
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

        /**
         * Tope de dispositivos: al entrar en uno nuevo se cierra la sesión
         * más vieja, para que una contraseña filtrada no deje sesiones
         * abiertas en equipos ajenos.
         */
        await SessionService.enforceLimit(user.id, user.workspaceId);

        await prisma.user.update({
            where: {
                id: user.id
            },
            data: {
                lastLoginAt: new Date(),
                status: user.role === UserRole.AGENT ? UserStatus.OFFLINE : user.status,
                failedLoginAttempts: 0,
                lockedUntil: null
            }
        });

        await LogService.create({
            workspaceId: user.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.AUTH,
            action: "LOGIN_SUCCESS",
            message: "Inicio de sesión correcto.",
            payload: {
                userId: user.id,
                email: user.email,
                role: user.role,
                twoFactor: options.twoFactor,
                ip: context.ip,
                userAgent: context.userAgent
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
