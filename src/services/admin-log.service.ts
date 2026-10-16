import { LogLevel, LogModule } from "@prisma/client";

import { prisma } from "../config/prisma";

type ListLogsParams = {
    workspaceId: string;
    level?: string;
    module?: string;
};

export class AdminLogService {
    static async listLogs(params: ListLogsParams) {
        const level =
            params.level && Object.values(LogLevel).includes(params.level as LogLevel)
                ? (params.level as LogLevel)
                : undefined;

        const module =
            params.module && Object.values(LogModule).includes(params.module as LogModule)
                ? (params.module as LogModule)
                : undefined;

        return prisma.log.findMany({
            where: {
                workspaceId: params.workspaceId,
                ...(level ? { level } : {}),
                ...(module ? { module } : {})
            },
            orderBy: {
                createdAt: "desc"
            },
            take: 100
        });
    }

    /**
     * Los últimos webhooks que recibió el servidor, tal como llegaron.
     *
     * Existe por dos razones muy concretas: comprobar contra Meta real qué
     * manda un botón (el identificador con el que se arma el mapeo de
     * respuestas) y poder copiar el volcado cuando hay que reportar un caso.
     * Sin esto, la única forma de verlo era entrar a la base.
     */
    static async listWebhookEvents(params: {
        workspaceId: string;
        take?: number;
    }) {
        /**
         * Los eventos en cola todavía no tienen empresa asignada: el worker la
         * resuelve al procesarlos. Si solo se buscara por `workspaceId`, un
         * evento recién llegado —o uno que agotó sus reintentos, que es
         * justo el que hay que mirar— no aparecería. Se cubren los dos casos
         * por el número que lo recibió, que sí viene desde el primer momento.
         */
        const numbers = await prisma.whatsAppNumber.findMany({
            where: {
                whatsappAccount: { workspaceId: params.workspaceId }
            },
            select: { phoneNumberId: true }
        });

        const phoneNumberIds = numbers.map((number) => number.phoneNumberId);

        return prisma.webhookEvent.findMany({
            where: {
                OR: [
                    { workspaceId: params.workspaceId },
                    { phoneNumberId: { in: phoneNumberIds } }
                ]
            },
            select: {
                id: true,
                payload: true,
                status: true,
                attempts: true,
                phoneNumberId: true,
                lastError: true,
                createdAt: true,
                processedAt: true
            },
            orderBy: {
                createdAt: "desc"
            },
            take: params.take ?? 20
        });
    }
}
