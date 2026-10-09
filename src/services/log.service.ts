import { LogLevel, LogModule, Prisma } from "@prisma/client";

import { prisma } from "../config/prisma";
import { redactSensitive } from "../utils/redact";
import { AlertService } from "./alert.service";

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
        const log = await prisma.log.create({
            data: {
                workspaceId: input.workspaceId || null,
                level: input.level,
                module: input.module,
                action: input.action,
                message: input.message,
                /**
                 * Las credenciales nunca deben quedar guardadas en la
                 * bitácora, aunque vengan dentro de un payload de Meta.
                 */
                payload: toPrismaJson(redactSensitive(input.payload))
            }
        });

        if (input.level === LogLevel.ERROR && AlertService.isEnabled()) {
            void AlertService.notify({
                title: "Error en producción",
                message: input.message,
                module: input.module,
                action: input.action,
                workspaceId: input.workspaceId || null,
                context: redactSensitive(input.payload)
            });
        }

        return log;
    }
}
