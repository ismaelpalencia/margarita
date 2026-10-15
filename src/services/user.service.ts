import crypto from "node:crypto";

import bcrypt from "bcrypt";
import {
    LogLevel,
    LogModule,
    UserRole,
    UserStatus
} from "@prisma/client";

import { prisma } from "../config/prisma";
import {
    CreateUserInput,
    UpdateUserInput
} from "../validations/user.validation";
import { checkAdminRemoval, checkRoleChange, generatePassword, TeamMember } from "../utils/team-rules";
import { LogService } from "./log.service";
import { SessionService } from "./session.service";
import { buildOtpAuthUrl, generateTotpSecret, verifyTotp } from "../utils/totp";
import { emailIndex } from "../utils/email";

/**
 * Nombre con el que la app de autenticación etiqueta la cuenta. Se arma con
 * el nombre de la empresa para que, si alguien administra varias
 * instalaciones, distinga de cuál es cada código.
 */
function twoFactorIssuer(workspaceName: string): string {
    return `Margarita (${workspaceName})`;
}

/**
 * Cuentas de la instalación: administradores y agentes.
 *
 * Se permiten **varios administradores** (antes solo el del alta), pero nunca
 * se puede dejar la instalación sin ninguno activo: esa regla vive en
 * `team-rules.ts` y se aplica antes de tocar la base.
 */
export class UserService {
    static async listTeam(workspaceId: string) {
        return prisma.user.findMany({
            where: {
                workspaceId
            },
            orderBy: [
                {
                    role: "asc"
                },
                {
                    createdAt: "asc"
                }
            ]
        });
    }

    /** Compatibilidad: algunos servicios solo necesitan a los agentes. */
    static async listAgents(workspaceId: string) {
        return prisma.user.findMany({
            where: {
                workspaceId,
                role: UserRole.AGENT
            },
            orderBy: {
                createdAt: "desc"
            }
        });
    }

    static async listActiveAgents(workspaceId: string) {
        return prisma.user.findMany({
            where: {
                workspaceId,
                role: UserRole.AGENT,
                isActive: true
            },
            orderBy: [
                {
                    status: "asc"
                },
                {
                    name: "asc"
                }
            ]
        });
    }

    static async getMemberById(workspaceId: string, userId: string) {
        const member = await prisma.user.findFirst({
            where: {
                id: userId,
                workspaceId
            }
        });

        if (!member) {
            throw new Error("Usuario no encontrado.");
        }

        return member;
    }

    /** Se mantiene el nombre anterior porque lo usan otros servicios. */
    static getAgentById(workspaceId: string, userId: string) {
        return this.getMemberById(workspaceId, userId);
    }

    static async countActiveAdmins(workspaceId: string): Promise<number> {
        return prisma.user.count({
            where: {
                workspaceId,
                role: UserRole.ADMIN,
                isActive: true
            }
        });
    }

    static async createUser(workspaceId: string, input: CreateUserInput) {
        /**
         * El correo va cifrado en la columna `email`; la unicidad se revisa
         * contra el índice ciego (`emailHash`), que es lo que sí se puede
         * comparar sin descifrar nada.
         */
        const existingUser = await prisma.user.findUnique({
            where: {
                emailHash: emailIndex(input.email)
            }
        });

        if (existingUser) {
            throw new Error("Ya existe un usuario con ese correo.");
        }

        const passwordHash = await bcrypt.hash(input.password, 12);

        const created = await prisma.user.create({
            data: {
                workspaceId,
                name: input.name,
                email: input.email,
                emailHash: emailIndex(input.email),
                password: passwordHash,
                role: input.role,
                status: UserStatus.OFFLINE,
                isActive: true,
                canSendManualMessages:
                    input.role === UserRole.ADMIN
                        ? true
                        : input.canSendManualMessages,
                manualMessageLimit:
                    input.role === UserRole.ADMIN
                        ? null
                        : input.manualMessageLimit
            }
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.INFO,
            module: LogModule.USER,
            action: "USER_CREATED",
            message:
                input.role === UserRole.ADMIN
                    ? "Se creó un administrador."
                    : "Se creó un agente.",
            payload: {
                userId: created.id,
                email: created.email,
                role: created.role
            }
        });

        return created;
    }

    /**
     * Actualiza nombre, rol y permisos. El rol pasa por la regla del último
     * administrador antes de tocar la base.
     */
    static async updateUser(
        workspaceId: string,
        userId: string,
        input: UpdateUserInput,
        actorId: string
    ) {
        const target = await this.getMemberById(workspaceId, userId);
        const activeAdmins = await this.countActiveAdmins(workspaceId);

        const roleCheck = checkRoleChange({
            target: target as TeamMember,
            newRole: input.role,
            activeAdmins
        });

        if (!roleCheck.allowed) {
            throw new Error(roleCheck.reason ?? "Cambio de rol no permitido.");
        }

        const roleChanged = target.role !== input.role;

        const updated = await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                name: input.name,
                role: input.role,
                canSendManualMessages: input.canSendManualMessages,
                manualMessageLimit:
                    input.role === UserRole.ADMIN
                        ? null
                        : input.manualMessageLimit
            }
        });

        if (roleChanged) {
            await LogService.create({
                workspaceId,
                level: LogLevel.WARN,
                module: LogModule.USER,
                action: "USER_ROLE_CHANGED",
                message:
                    input.role === UserRole.ADMIN
                        ? "Se dio acceso de administrador a un usuario."
                        : "Se quitó el acceso de administrador a un usuario.",
                payload: {
                    userId,
                    from: target.role,
                    to: input.role,
                    by: actorId
                }
            });
        }

        return updated;
    }

    /**
     * Activa o desactiva a alguien. Al desactivar se cierran sus sesiones:
     * si no, seguiría trabajando hasta que caduque la cookie.
     */
    static async setActive(
        workspaceId: string,
        userId: string,
        isActive: boolean,
        actorId: string
    ) {
        const target = await this.getMemberById(workspaceId, userId);
        const activeAdmins = await this.countActiveAdmins(workspaceId);

        if (!isActive) {
            const check = checkAdminRemoval({
                target: target as TeamMember,
                activeAdmins
            });

            if (!check.allowed) {
                throw new Error(check.reason ?? "No se puede desactivar.");
            }
        }

        const updated = await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                isActive,
                status: isActive ? target.status : UserStatus.OFFLINE
            }
        });

        if (!isActive) {
            const closed = await prisma.userSession.updateMany({
                where: {
                    userId,
                    isActive: true
                },
                data: {
                    isActive: false
                }
            });

            await LogService.create({
                workspaceId,
                level: LogLevel.WARN,
                module: LogModule.USER,
                action: "USER_DEACTIVATED",
                message: "Se desactivó un usuario y se cerraron sus sesiones.",
                payload: { userId, by: actorId, sessionsClosed: closed.count }
            });
        } else {
            await LogService.create({
                workspaceId,
                level: LogLevel.INFO,
                module: LogModule.USER,
                action: "USER_ACTIVATED",
                message: "Se reactivó un usuario.",
                payload: { userId, by: actorId }
            });
        }

        return updated;
    }

    /** Compatibilidad con el flujo anterior del panel. */
    static async toggleAgentStatus(
        workspaceId: string,
        userId: string,
        actorId?: string
    ) {
        const target = await this.getMemberById(workspaceId, userId);

        return this.setActive(
            workspaceId,
            userId,
            !target.isActive,
            actorId ?? userId
        );
    }

    /**
     * Restablece la contraseña de otra persona.
     *
     * La contraseña nueva la escribe el administrador (o la genera el
     * sistema), y quien la recibe **tiene que cambiarla** al entrar: así el
     * administrador no se queda sabiendo la contraseña definitiva de nadie.
     * Además se cierran todas sus sesiones.
     */
    static async resetPassword(
        workspaceId: string,
        userId: string,
        newPassword: string,
        actorId: string
    ) {
        const target = await this.getMemberById(workspaceId, userId);
        const passwordHash = await bcrypt.hash(newPassword, 12);

        await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                password: passwordHash,
                mustChangePassword: true,
                failedLoginAttempts: 0,
                lockedUntil: null
            }
        });

        const closed = await SessionService.revokeAllFor(userId);

        await LogService.create({
            workspaceId,
            level: LogLevel.WARN,
            module: LogModule.USER,
            action: "USER_PASSWORD_RESET",
            message:
                "Un administrador restableció la contraseña de un usuario.",
            payload: {
                userId,
                email: target.email,
                by: actorId,
                sessionsClosed: closed
            }
        });
    }

    /** Sugerencia de contraseña temporal, para mostrarla en el panel. */
    static suggestPassword(): string {
        const random = crypto.randomBytes(32);

        return generatePassword((index) => random[index]);
    }

    /**
     * Primer paso para activar la verificación en dos pasos: genera el
     * secreto y lo guarda, pero **no la habilita**. La persona tiene que
     * confirmar un código antes, para que nadie se quede fuera por escanear
     * mal o por cerrar la pantalla a medias.
     */
    static async startTwoFactor(userId: string) {
        const user = await prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                workspaceId: true,
                twoFactorEnabledAt: true,
                workspace: { select: { name: true } }
            }
        });

        if (user.twoFactorEnabledAt) {
            throw new Error(
                "Tu cuenta ya tiene la verificación en dos pasos activada. " +
                    "Si cambiaste de teléfono, desactívala primero con un código."
            );
        }

        const secret = generateTotpSecret();

        await prisma.user.update({
            where: { id: userId },
            data: {
                twoFactorSecret: secret,
                twoFactorEnabledAt: null
            }
        });

        return {
            secret,
            otpauthUrl: buildOtpAuthUrl({
                secret,
                account: user.email,
                issuer: twoFactorIssuer(user.workspace.name)
            })
        };
    }

    /**
     * Estado de la verificación en dos pasos de una cuenta, para pintar la
     * pantalla de seguridad: si está activa o si quedó una activación a
     * medias (secreto generado sin confirmar).
     */
    static async twoFactorState(userId: string) {
        const user = await prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                twoFactorSecret: true,
                twoFactorEnabledAt: true,
                workspace: { select: { name: true } }
            }
        });

        const enabled = Boolean(user.twoFactorEnabledAt);
        const pendingSecret =
            !enabled && user.twoFactorSecret ? user.twoFactorSecret : null;

        return {
            enabled,
            pendingSecret,
            otpauthUrl: pendingSecret
                ? buildOtpAuthUrl({
                      secret: pendingSecret,
                      account: user.email,
                      issuer: twoFactorIssuer(user.workspace.name)
                  })
                : null
        };
    }

    /**
     * Descartar una activación a medias: borra el secreto que nunca se
     * confirmó. La cuenta sigue sin verificación en dos pasos.
     */
    static async cancelTwoFactor(userId: string) {
        await prisma.user.update({
            where: { id: userId },
            data: { twoFactorSecret: null, twoFactorEnabledAt: null }
        });
    }

    /** Segundo paso: el código correcto confirma la activación. */
    static async confirmTwoFactor(userId: string, code: string) {
        const user = await prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: { id: true, email: true, workspaceId: true, twoFactorSecret: true }
        });

        if (!user.twoFactorSecret) {
            throw new Error(
                "Primero hay que generar la clave de verificación en dos pasos."
            );
        }

        if (!verifyTotp(user.twoFactorSecret, code)) {
            throw new Error(
                "El código no es correcto. Revisa que la hora del teléfono esté en automático."
            );
        }

        await prisma.user.update({
            where: { id: userId },
            data: { twoFactorEnabledAt: new Date() }
        });

        await LogService.create({
            workspaceId: user.workspaceId,
            level: LogLevel.WARN,
            module: LogModule.AUTH,
            action: "TWO_FACTOR_ENABLED",
            message: "Se activó la verificación en dos pasos de una cuenta.",
            payload: { userId: user.id }
        });
    }

    /**
     * Desactivar la propia. Se exige un código vigente: con la sesión robada
     * no basta para apagar la protección.
     */
    static async disableTwoFactor(userId: string, code: string) {
        const user = await prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: {
                id: true,
                workspaceId: true,
                twoFactorSecret: true,
                twoFactorEnabledAt: true
            }
        });

        if (!user.twoFactorEnabledAt || !user.twoFactorSecret) {
            throw new Error("Tu cuenta no tiene la verificación en dos pasos activada.");
        }

        if (!verifyTotp(user.twoFactorSecret, code)) {
            throw new Error("El código no es correcto.");
        }

        await prisma.user.update({
            where: { id: userId },
            data: { twoFactorSecret: null, twoFactorEnabledAt: null }
        });

        await LogService.create({
            workspaceId: user.workspaceId,
            level: LogLevel.WARN,
            module: LogModule.AUTH,
            action: "TWO_FACTOR_DISABLED",
            message: "Se desactivó la verificación en dos pasos de una cuenta.",
            payload: { userId: user.id, by: userId }
        });
    }

    /**
     * Recuperación: un administrador apaga la verificación de alguien que
     * perdió el teléfono. Queda en la bitácora con quién lo hizo.
     */
    static async disableTwoFactorAsAdmin(
        workspaceId: string,
        userId: string,
        actorId: string
    ) {
        const target = await this.getMemberById(workspaceId, userId);

        if (!target.twoFactorEnabledAt) {
            throw new Error("Esa cuenta no tiene la verificación en dos pasos activada.");
        }

        await prisma.user.update({
            where: { id: userId },
            data: { twoFactorSecret: null, twoFactorEnabledAt: null }
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.WARN,
            module: LogModule.AUTH,
            action: "TWO_FACTOR_DISABLED",
            message:
                "Un administrador desactivó la verificación en dos pasos de una cuenta.",
            payload: { userId, email: target.email, by: actorId }
        });
    }

    /** Cuántas cuentas (y cuántos administradores) tienen 2FA activada. */
    static async twoFactorSummary(workspaceId: string) {
        const [enabled, admins, adminsEnabled] = await Promise.all([
            prisma.user.count({ where: { workspaceId, twoFactorEnabledAt: { not: null } } }),
            prisma.user.count({ where: { workspaceId, role: UserRole.ADMIN, isActive: true } }),
            prisma.user.count({
                where: {
                    workspaceId,
                    role: UserRole.ADMIN,
                    isActive: true,
                    twoFactorEnabledAt: { not: null }
                }
            })
        ]);

        return { enabled, admins, adminsEnabled };
    }

    /**
     * Cambio de contraseña por la propia persona. Cierra las **demás**
     * sesiones: si alguien había entrado con la contraseña vieja, se queda
     * fuera.
     */
    static async changeOwnPassword(params: {
        userId: string;
        currentPassword: string;
        newPassword: string;
        keepTokenId?: string;
    }) {
        const user = await prisma.user.findUnique({
            where: {
                id: params.userId
            }
        });

        if (!user) {
            throw new Error("Usuario no encontrado.");
        }

        const valid = await bcrypt.compare(
            params.currentPassword,
            user.password
        );

        if (!valid) {
            throw new Error("La contraseña actual no es correcta.");
        }

        if (params.currentPassword === params.newPassword) {
            throw new Error("La contraseña nueva debe ser distinta a la actual.");
        }

        const passwordHash = await bcrypt.hash(params.newPassword, 12);

        await prisma.user.update({
            where: {
                id: params.userId
            },
            data: {
                password: passwordHash,
                mustChangePassword: false
            }
        });

        const closed = params.keepTokenId
            ? await SessionService.revokeOthers(params.userId, params.keepTokenId)
            : await SessionService.revokeAllFor(params.userId);

        await LogService.create({
            workspaceId: user.workspaceId,
            level: LogLevel.WARN,
            module: LogModule.AUTH,
            action: "PASSWORD_CHANGED",
            message: "Un usuario cambió su propia contraseña.",
            payload: {
                userId: user.id,
                otherSessionsClosed: closed
            }
        });

        return { otherSessionsClosed: closed };
    }
}
