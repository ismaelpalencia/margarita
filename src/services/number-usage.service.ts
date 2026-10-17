import { LogLevel, LogModule } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { LogService } from "./log.service";

/**
 * Consumo del mes por número.
 *
 * WhatsApp regala un tramo de mensajes de **servicio** por número y cobra las
 * plantillas. Este servicio cuenta lo que de verdad se cobra —entregado o
 * leído, nunca lo que falló— y lo agrupa por número, para que el panel pueda
 * avisar antes de pasarse del tramo.
 *
 * Dos decisiones que valen la pena:
 *
 * - **Se cuenta lo entregado, no lo intentado.** Un mensaje que Meta rechazó no
 *   cuesta y, si lo contáramos, el número del panel no cuadraría con la factura.
 * - **Servicio y plantillas van aparte.** El tramo gratis aplica al servicio;
 *   las plantillas se cobran desde la primera, con su propia tarifa.
 */

export type UsageTotals = {
    service: number;
    utility: number;
    marketing: number;
    otherTemplates: number;
};

export type NumberUsage = {
    numberId: string;
    displayName: string;
    phoneNumber: string;
    isActive: boolean;
    messagingLimit: string | null;
    service: {
        used: number;
        limit: number;
        remaining: number;
        percent: number;
        cost: number;
    };
    utility: { used: number; cost: number };
    marketing: { used: number; cost: number };
    otherTemplates: number;
    /** Suma de lo que Meta cobraría con las tarifas configuradas. */
    estimatedCost: number;
    currency: string;
    alert: boolean;
};

export type UsageRow = {
    numberId: string;
    type: string;
    category: string;
    total: number;
};

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Clasifica la fila que devuelve la base.
 *
 * `category` llega vacía cuando la plantilla no se puede resolver (por ejemplo,
 * un envío suelto desde el hilo): esos se cuentan como "otras plantillas" y no
 * se les inventa una tarifa.
 */
export function classifyUsageRow(row: UsageRow): keyof UsageTotals {
    if (row.type !== "TEMPLATE") {
        return "service";
    }

    switch (row.category.toUpperCase()) {
        case "UTILITY":
            return "utility";
        case "MARKETING":
            return "marketing";
        default:
            return "otherTemplates";
    }
}

export function buildNumberUsage(params: {
    numbers: Array<{
        id: string;
        displayName: string | null;
        phoneNumber: string;
        isActive: boolean;
        messagingLimit: string | null;
    }>;
    rows: UsageRow[];
    limit: number;
    rates: { service: number; utility: number; marketing: number };
    currency: string;
    alertPercent: number;
}): NumberUsage[] {
    const totals = new Map<string, UsageTotals>();

    for (const number of params.numbers) {
        totals.set(number.id, {
            service: 0,
            utility: 0,
            marketing: 0,
            otherTemplates: 0
        });
    }

    for (const row of params.rows) {
        const bucket = totals.get(row.numberId);

        if (bucket) {
            bucket[classifyUsageRow(row)] += row.total;
        }
    }

    return params.numbers.map((number) => {
        const bucket = totals.get(number.id)!;
        const limit = Math.max(0, params.limit);
        const remaining = Math.max(0, limit - bucket.service);
        const percent =
            limit === 0 ? 100 : Math.min(100, Math.round((bucket.service / limit) * 100));
        const serviceCost =
            Math.max(0, bucket.service - limit) * params.rates.service;

        const utilityCost = bucket.utility * params.rates.utility;
        const marketingCost = bucket.marketing * params.rates.marketing;

        return {
            numberId: number.id,
            displayName: number.displayName || number.phoneNumber,
            phoneNumber: number.phoneNumber,
            isActive: number.isActive,
            messagingLimit: number.messagingLimit,
            service: {
                used: bucket.service,
                limit,
                remaining,
                percent,
                cost: round(serviceCost)
            },
            utility: { used: bucket.utility, cost: round(utilityCost) },
            marketing: { used: bucket.marketing, cost: round(marketingCost) },
            otherTemplates: bucket.otherTemplates,
            estimatedCost: round(serviceCost + utilityCost + marketingCost),
            currency: params.currency,
            alert: percent >= params.alertPercent
        };
    });
}

export class NumberUsageService {
    /** Inicio del mes en la zona de la empresa. */
    static async forWorkspace(
        workspaceId: string,
        monthStart: Date
    ): Promise<NumberUsage[]> {
        const numbers = await prisma.whatsAppNumber.findMany({
            where: { whatsappAccount: { workspaceId } },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                displayName: true,
                phoneNumber: true,
                isActive: true,
                messagingLimit: true
            }
        });

        if (numbers.length === 0) {
            return [];
        }

        /**
         * Se agrupa en la base: traer los mensajes al servidor para contarlos
         * sería carísimo en un mes de campañas.
         */
        const rows = await prisma.$queryRaw<UsageRow[]>`
            SELECT
                c."whatsappNumberId" AS "numberId",
                m."type"::text AS "type",
                COALESCE(t."category", '') AS "category",
                COUNT(*)::int AS "total"
            FROM "Message" m
            JOIN "Conversation" c ON c."id" = m."conversationId"
            LEFT JOIN "Campaign" cp ON cp."id" = m."campaignId"
            LEFT JOIN "Template" t ON t."id" = cp."templateId"
            WHERE m."workspaceId" = ${workspaceId}
              AND m."direction" = 'OUT'::"MessageDirection"
              AND m."status" IN ('DELIVERED'::"MessageStatus", 'READ'::"MessageStatus")
              AND m."createdAt" >= ${monthStart}
            GROUP BY 1, 2, 3
        `;

        return buildNumberUsage({
            numbers,
            rows,
            limit: appConfig.serviceFreeMessages,
            rates: {
                service: appConfig.serviceMessageRate,
                utility: appConfig.utilityTemplateRate,
                marketing: appConfig.marketingTemplateRate
            },
            currency: appConfig.usageCurrency,
            alertPercent: appConfig.usageAlertPercent
        });
    }

    /**
     * El número con más tramo disponible, para abrir conversaciones nuevas.
     * Solo entre los activos: sugerir uno apagado no le sirve a nadie.
     */
    static suggested(usage: NumberUsage[]): NumberUsage | null {
        const active = usage.filter((item) => item.isActive);

        if (active.length === 0) {
            return null;
        }

        return [...active].sort(
            (a, b) => b.service.remaining - a.service.remaining
        )[0];
    }

    /**
     * Deja una alerta en la bitácora la primera vez que un número pasa del
     * umbral en el mes. No se repite para no llenar los logs ni las alertas
     * externas con el mismo aviso.
     */
    static async alertIfNeeded(
        workspaceId: string,
        usage: NumberUsage[],
        monthKey: string
    ): Promise<void> {
        for (const item of usage) {
            if (!item.alert) {
                continue;
            }

            const number = await prisma.whatsAppNumber.findUnique({
                where: { id: item.numberId },
                select: { usageAlertMonth: true }
            });

            if (!number || number.usageAlertMonth === monthKey) {
                continue;
            }

            await prisma.whatsAppNumber.update({
                where: { id: item.numberId },
                data: { usageAlertMonth: monthKey }
            });

            await LogService.create({
                workspaceId,
                level: LogLevel.WARN,
                module: LogModule.WHATSAPP_ACCOUNT,
                action: "NUMBER_USAGE_ALERT",
                message: `El número ${item.displayName} pasó el ${item.service.percent}% del tramo mensual de servicio.`,
                payload: {
                    numberId: item.numberId,
                    month: monthKey,
                    used: item.service.used,
                    limit: item.service.limit,
                    percent: item.service.percent
                }
            });
        }
    }
}
