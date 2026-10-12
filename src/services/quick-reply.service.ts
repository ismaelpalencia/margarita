import { LogLevel, LogModule } from "@prisma/client";

import { prisma } from "../config/prisma";
import {
    CreateQuickReplyInput,
    UpdateQuickReplyInput
} from "../validations/quick-reply.validation";
import { LogService } from "./log.service";

/**
 * Respuestas rápidas: textos guardados que el equipo inserta en el hilo
 * con un clic. Se marcan como inactivas en lugar de borrarse, para no
 * perder lo que alguien ya venía usando.
 */
export class QuickReplyService {
    static async listAll(workspaceId: string) {
        return prisma.quickReply.findMany({
            where: {
                workspaceId
            },
            orderBy: [
                {
                    isActive: "desc"
                },
                {
                    title: "asc"
                }
            ]
        });
    }

    /** Solo las activas: es lo que ve el agente en el compositor. */
    static async listActive(workspaceId: string) {
        return prisma.quickReply.findMany({
            where: {
                workspaceId,
                isActive: true
            },
            orderBy: {
                title: "asc"
            }
        });
    }

    static async getById(workspaceId: string, quickReplyId: string) {
        const quickReply = await prisma.quickReply.findFirst({
            where: {
                id: quickReplyId,
                workspaceId
            }
        });

        if (!quickReply) {
            throw new Error("Respuesta rápida no encontrada.");
        }

        return quickReply;
    }

    static async create(
        workspaceId: string,
        userId: string,
        input: CreateQuickReplyInput
    ) {
        const existing = await prisma.quickReply.findUnique({
            where: {
                workspaceId_title: {
                    workspaceId,
                    title: input.title
                }
            }
        });

        if (existing) {
            /** Volver a crearla con el mismo título la reactiva y actualiza. */
            return prisma.quickReply.update({
                where: {
                    id: existing.id
                },
                data: {
                    body: input.body,
                    isActive: true
                }
            });
        }

        const quickReply = await prisma.quickReply.create({
            data: {
                workspaceId,
                title: input.title,
                body: input.body,
                createdById: userId,
                isActive: true
            }
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.INFO,
            module: LogModule.SYSTEM,
            action: "QUICK_REPLY_CREATED",
            message: "Se creó una respuesta rápida.",
            payload: {
                quickReplyId: quickReply.id,
                title: quickReply.title
            }
        });

        return quickReply;
    }

    static async update(
        workspaceId: string,
        quickReplyId: string,
        input: UpdateQuickReplyInput
    ) {
        await this.getById(workspaceId, quickReplyId);

        const clash = await prisma.quickReply.findUnique({
            where: {
                workspaceId_title: {
                    workspaceId,
                    title: input.title
                }
            }
        });

        if (clash && clash.id !== quickReplyId) {
            throw new Error("Ya existe otra respuesta rápida con ese título.");
        }

        return prisma.quickReply.update({
            where: {
                id: quickReplyId
            },
            data: {
                title: input.title,
                body: input.body
            }
        });
    }

    static async setActive(
        workspaceId: string,
        quickReplyId: string,
        isActive: boolean
    ) {
        await this.getById(workspaceId, quickReplyId);

        return prisma.quickReply.update({
            where: {
                id: quickReplyId
            },
            data: {
                isActive
            }
        });
    }
}
