import { prisma } from "../config/prisma";
import {
    CreateTagInput,
    UpdateTagInput
} from "../validations/tag.validation";

export class TagService {
    static async listTags(workspaceId: string) {
        return prisma.tag.findMany({
            where: {
                workspaceId,
                isActive: true
            },
            orderBy: {
                createdAt: "desc"
            }
        });
    }

    static async createTag(workspaceId: string, input: CreateTagInput) {
        const existingTag = await prisma.tag.findUnique({
            where: {
                workspaceId_name: {
                    workspaceId,
                    name: input.name
                }
            }
        });

        if (existingTag && existingTag.isActive) {
            throw new Error("Ya existe una etiqueta activa con ese nombre.");
        }

        if (existingTag && !existingTag.isActive) {
            return prisma.tag.update({
                where: {
                    id: existingTag.id
                },
                data: {
                    name: input.name,
                    color: input.color,
                    isActive: true
                }
            });
        }

        return prisma.tag.create({
            data: {
                workspaceId,
                name: input.name,
                color: input.color,
                isActive: true
            }
        });
    }

    static async getTagById(workspaceId: string, tagId: string) {
        const tag = await prisma.tag.findFirst({
            where: {
                id: tagId,
                workspaceId,
                isActive: true
            }
        });

        if (!tag) {
            throw new Error("Etiqueta no encontrada.");
        }

        return tag;
    }

    static async updateTag(
        workspaceId: string,
        tagId: string,
        input: UpdateTagInput
    ) {
        await this.getTagById(workspaceId, tagId);

        const existingTag = await prisma.tag.findUnique({
            where: {
                workspaceId_name: {
                    workspaceId,
                    name: input.name
                }
            }
        });

        if (existingTag && existingTag.id !== tagId && existingTag.isActive) {
            throw new Error("Ya existe otra etiqueta activa con ese nombre.");
        }

        return prisma.tag.update({
            where: {
                id: tagId
            },
            data: {
                name: input.name,
                color: input.color
            }
        });
    }

    static async deactivateTag(workspaceId: string, tagId: string) {
        await this.getTagById(workspaceId, tagId);

        return prisma.tag.update({
            where: {
                id: tagId
            },
            data: {
                isActive: false
            }
        });
    }
}
