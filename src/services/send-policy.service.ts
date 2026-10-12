import {
    MessageDirection,
    MessageSource,
    MessageStatus,
    UserRole
} from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { startOfTodayIn } from "../utils/date";

type SendableUser = {
    id: string;
    role: string;
    workspaceId: string;
    canSendManualMessages: boolean;
    manualMessageLimit: number | null;
};

export type ManualUsage = {
    used: number;
    /** `null` significa sin tope. */
    limit: number | null;
    remaining: number | null;
};

/**
 * Reglas de envío: quién puede escribir, cuánto y a quién.
 *
 * Dos controles que hasta ahora solo se configuraban en la interfaz:
 *
 * - **Permiso y tope diario.** Un agente sin `canSendManualMessages` no
 *   envía nada, y con `manualMessageLimit` se le corta al llegar al tope
 *   del día. El admin no tiene tope: es quien opera la herramienta.
 *
 * - **Bajas.** Un contacto que pidió la baja (STOP) o al que el admin le
 *   marcó la baja no recibe nada: ni campañas ni respuestas manuales.
 *
 * El uso del día se calcula contando los mensajes manuales realmente
 * enviados (no las notas internas, que nunca salen del panel), así que se
 * reinicia solo a la medianoche local y no puede quedar desincronizado.
 */
export class SendPolicyService {
    static async timezoneFor(workspaceId: string): Promise<string> {
        const settings = await prisma.workspaceSettings.findUnique({
            where: {
                workspaceId
            },
            select: {
                timezone: true
            }
        });

        return settings?.timezone || appConfig.timezone;
    }

    /** Tope aplicable: el del usuario o, si no definió, el de la empresa. */
    private static async limitFor(user: SendableUser): Promise<number | null> {
        if (user.role !== UserRole.AGENT) {
            return null;
        }

        if (user.manualMessageLimit !== null) {
            return user.manualMessageLimit;
        }

        const settings = await prisma.workspaceSettings.findUnique({
            where: {
                workspaceId: user.workspaceId
            },
            select: {
                maxManualMessages: true
            }
        });

        return settings?.maxManualMessages ?? null;
    }

    static async usageToday(user: SendableUser): Promise<ManualUsage> {
        const [timezone, limit] = await Promise.all([
            this.timezoneFor(user.workspaceId),
            this.limitFor(user)
        ]);

        const used = await prisma.message.count({
            where: {
                sentByUserId: user.id,
                direction: MessageDirection.OUT,
                source: MessageSource.MANUAL,
                isInternalNote: false,
                status: {
                    not: MessageStatus.FAILED
                },
                createdAt: {
                    gte: startOfTodayIn(timezone)
                }
            }
        });

        return {
            used,
            limit,
            remaining: limit === null ? null : Math.max(0, limit - used)
        };
    }

    /**
     * Uso de hoy de todos los agentes de la empresa, en una sola consulta.
     * Se usa para mostrarlo en la lista de agentes.
     */
    static async usageTodayByUser(
        workspaceId: string
    ): Promise<Record<string, number>> {
        const timezone = await this.timezoneFor(workspaceId);

        const grouped = await prisma.message.groupBy({
            by: ["sentByUserId"],
            where: {
                workspaceId,
                direction: MessageDirection.OUT,
                source: MessageSource.MANUAL,
                isInternalNote: false,
                status: {
                    not: MessageStatus.FAILED
                },
                sentByUserId: {
                    not: null
                },
                createdAt: {
                    gte: startOfTodayIn(timezone)
                }
            },
            _count: {
                _all: true
            }
        });

        const usage: Record<string, number> = {};

        for (const row of grouped) {
            if (row.sentByUserId) {
                usage[row.sentByUserId] = row._count._all;
            }
        }

        return usage;
    }

    /** Un contacto dado de baja no recibe nada, por ningún canal. */
    static assertContactReachable(contact: {
        optOutAt: Date | null;
    }): void {
        if (contact.optOutAt) {
            throw new Error(
                "Este contacto pidió la baja (STOP): no se le pueden enviar mensajes. " +
                    "Si te autorizó de nuevo, reactívalo desde su ficha."
            );
        }
    }

    /**
     * Valida baja, permiso y tope diario antes de enviar un mensaje manual.
     * Lanza un error con el motivo exacto: el panel lo muestra tal cual.
     *
     * Los permisos se leen del usuario en este momento (no de la sesión):
     * si el admin acaba de quitarle el permiso a un agente, el siguiente
     * envío ya se bloquea.
     */
    static async assertCanSendManually(params: {
        userId: string;
        role: string;
        contact: { optOutAt: Date | null };
    }): Promise<void> {
        this.assertContactReachable(params.contact);

        if (params.role !== UserRole.AGENT) {
            return;
        }

        const user = await prisma.user.findUnique({
            where: {
                id: params.userId
            },
            select: {
                id: true,
                role: true,
                workspaceId: true,
                canSendManualMessages: true,
                manualMessageLimit: true
            }
        });

        if (!user) {
            throw new Error("Usuario no encontrado.");
        }

        if (!user.canSendManualMessages) {
            throw new Error(
                "Tu usuario no tiene permiso para enviar mensajes manuales. " +
                    "Pídeselo al administrador."
            );
        }

        const usage = await this.usageToday(user);

        if (usage.limit !== null && usage.used >= usage.limit) {
            throw new Error(
                `Llegaste a tu límite de ${usage.limit} mensajes manuales por hoy. ` +
                    "Se reinicia a medianoche; mañana puedes seguir respondiendo."
            );
        }
    }
}
