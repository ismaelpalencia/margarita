import { LogLevel, LogModule, Prisma } from "@prisma/client";

import { prisma } from "../config/prisma";

type CreateLogInput = {
    workspaceId?: string | null;
    level: LogLevel;
    module: LogModule;
    action: string;
    message: string;
    payload?: unknown;
};

function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined) {
        return undefined;
    }

    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export class LogService {
    static async create(input: CreateLogInput) {
        return prisma.log.create({
            data: {
                workspaceId: input.workspaceId || null,
                level: input.level,
                module: input.module,
                action: input.action,
                message: input.message,
                payload: toPrismaJson(input.payload)
            }
        });
    }
}