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
}