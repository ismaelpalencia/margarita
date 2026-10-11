import {
    ConversationOperationalStatus,
    ConversationSource,
    ConversationStatus,
    LogLevel,
    LogModule,
    MessageDirection,
    UserRole
} from "@prisma/client";

import { prisma } from "../config/prisma";
import { emitToWorkspace } from "../sockets";
import { describeMetaError } from "../utils/meta-error";
import { LogService } from "./log.service";

type ListConversationsParams = {
    workspaceId: string;
    userId?: string;
    role: "ADMIN" | "AGENT";
    status?: string;
};

export class ConversationService {
    static async listConversations(params: ListConversationsParams) {
        return prisma.conversation.findMany({
            where: {
                workspaceId: params.workspaceId,
                ...(params.role === "AGENT"
                    ? {
                          assignedUserId: params.userId
                      }
                    : {}),
                ...(params.status
                    ? {
                          status: params.status as ConversationStatus
                      }
                    : {})
            },
            include: {
                contact: true,
                assignedUser: true,
                messages: {
                    orderBy: {
                        createdAt: "desc"
                    },
                    take: 1
                }
            },
            orderBy: [
                {
                    lastMessageAt: "desc"
                },
                {
                    createdAt: "desc"
                }
            ]
        });
    }

    static async listForAdmin(workspaceId: string) {
        return prisma.conversation.findMany({
            where: {
                workspaceId
            },
            include: {
                contact: true,
                assignedUser: true,
                messages: {
                    orderBy: {
                        createdAt: "desc"
                    },
                    take: 1
                }
            },
            orderBy: [
                {
                    lastMessageAt: "desc"
                },
                {
                    createdAt: "desc"
                }
            ]
        });
    }

    static async listForAgent(workspaceId: string, agentId: string) {
        return prisma.conversation.findMany({
            where: {
                workspaceId,
                assignedUserId: agentId
            },
            include: {
                contact: true,
                assignedUser: true,
                messages: {
                    orderBy: {
                        createdAt: "desc"
                    },
                    take: 1
                }
            },
            orderBy: [
                {
                    lastMessageAt: "desc"
                },
                {
                    createdAt: "desc"
                }
            ]
        });
    }

    static async openFromContact(workspaceId: string, contactId: string) {
        const contact = await prisma.contact.findFirst({
            where: {
                id: contactId,
                workspaceId,
                isActive: true
            }
        });

        if (!contact) {
            throw new Error("Contacto no encontrado.");
        }

        const existingConversation = await prisma.conversation.findUnique({
            where: {
                workspaceId_contactId: {
                    workspaceId,
                    contactId
                }
            }
        });

        if (existingConversation) {
            return prisma.conversation.update({
                where: {
                    id: existingConversation.id
                },
                data: {
                    status: "OPEN",
                    closedAt: null
                }
            });
        }

        return prisma.conversation.create({
            data: {
                workspaceId,
                contactId,
                status: "OPEN",
                operationalStatus: "UNASSIGNED",
                source: "MANUAL",
                lastMessageAt: new Date()
            }
        });
    }

    static async getConversationForAdmin(
        workspaceId: string,
        conversationId: string,
        options: { includeDeleted?: boolean } = {}
    ) {
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                workspaceId
            },
            include: {
                contact: {
                    include: {
                        tags: {
                            include: {
                                tag: true
                            },
                            where: {
                                tag: {
                                    isActive: true
                                }
                            }
                        }
                    }
                },
                assignedUser: true,
                messages: {
                    /**
                     * Los mensajes eliminados se ocultan del hilo. El admin
                     * puede verlos con el interruptor "ver eliminados".
                     */
                    where: options.includeDeleted ? {} : { deletedAt: null },
                    orderBy: {
                        createdAt: "asc"
                    }
                },
                assignments: {
                    include: {
                        fromUser: true,
                        toUser: true,
                        assignedBy: true
                    },
                    orderBy: {
                        createdAt: "desc"
                    }
                }
            }
        });

        if (!conversation) {
            throw new Error("Conversación no encontrada.");
        }

        return this.withMessageErrors(conversation);
    }

    static async getConversationForAgent(
        workspaceId: string,
        userId: string,
        conversationId: string
    ) {
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                workspaceId,
                assignedUserId: userId
            },
            include: {
                contact: {
                    include: {
                        tags: {
                            include: {
                                tag: true
                            },
                            where: {
                                tag: {
                                    isActive: true
                                }
                            }
                        }
                    }
                },
                assignedUser: true,
                messages: {
                    where: { deletedAt: null },
                    orderBy: {
                        createdAt: "asc"
                    }
                }
            }
        });

        if (!conversation) {
            throw new Error("Conversación no encontrada o no asignada a ti.");
        }

        return this.withMessageErrors(conversation);
    }

    /**
     * Adjunta a cada mensaje la explicación del error de Meta, si lo
     * hubo. El motivo ya venía guardado en `metaResponse`, pero no se
     * mostraba en ninguna parte: la conversación solo decía FAILED.
     */
    private static withMessageErrors<
        T extends { messages: Array<{ metaResponse: unknown }> }
    >(conversation: T): T {
        return {
            ...conversation,
            messages: conversation.messages.map((message) => ({
                ...message,
                errorText: describeMetaError(message.metaResponse)
            }))
        };
    }

    static async createOrOpenConversationFromContact(
        workspaceId: string,
        contactId: string,
        source: ConversationSource = ConversationSource.MANUAL
    ) {
        const contact = await prisma.contact.findFirst({
            where: {
                id: contactId,
                workspaceId,
                isActive: true
            }
        });

        if (!contact) {
            throw new Error("Contacto no encontrado.");
        }

        const existingConversation = await prisma.conversation.findUnique({
            where: {
                workspaceId_contactId: {
                    workspaceId,
                    contactId
                }
            }
        });

        if (existingConversation) {
            return prisma.conversation.update({
                where: {
                    id: existingConversation.id
                },
                data: {
                    status: ConversationStatus.OPEN,
                    operationalStatus: existingConversation.assignedUserId
                        ? ConversationOperationalStatus.ASSIGNED
                        : ConversationOperationalStatus.UNASSIGNED,
                    source,
                    closedAt: null
                }
            });
        }

        return prisma.conversation.create({
            data: {
                workspaceId,
                contactId,
                status: ConversationStatus.OPEN,
                operationalStatus: ConversationOperationalStatus.UNASSIGNED,
                source,
                lastMessageAt: new Date()
            }
        });
    }

    static async assignConversation(
        workspaceId: string,
        conversationId: string,
        agentId: string | null,
        assignedByUserId: string
    ) {
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                workspaceId
            }
        });

    if (!conversation) {
        throw new Error("Conversación no encontrada.");
    }

    let agent: { id: string; name: string } | null = null;

    if (agentId) {
        agent = await prisma.user.findFirst({
            where: {
                id: agentId,
                workspaceId,
                role: UserRole.AGENT,
                isActive: true
            },
            select: {
                id: true,
                name: true
            }
        });

        if (!agent) {
            throw new Error("Agente no encontrado o inactivo.");
        }
    }

    const updatedConversation = await prisma.conversation.update({
        where: {
            id: conversation.id
        },
        data: {
            assignedUserId: agent ? agent.id : null,
            operationalStatus: agent
                ? ConversationOperationalStatus.ASSIGNED
                : ConversationOperationalStatus.UNASSIGNED,
            status: ConversationStatus.OPEN,
            closedAt: null
        }
    });

    await prisma.assignmentHistory.create({
        data: {
            conversationId: conversation.id,
            fromUserId: conversation.assignedUserId,
            toUserId: agent ? agent.id : null,
            assignedById: assignedByUserId
        }
    });

    emitToWorkspace(workspaceId, "conversation:assigned", {
        conversationId: conversation.id,
        assignedUserId: agent ? agent.id : null,
        agentName: agent ? agent.name : null,
        reason: "MANUAL"
    });

    return updatedConversation;
}

    static async closeConversation(
        workspaceId: string,
        conversationId: string,
        userId: string,
        role: "ADMIN" | "AGENT"
    ) {
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                workspaceId,
                ...(role === "AGENT"
                    ? {
                          assignedUserId: userId
                      }
                    : {})
            }
        });

        if (!conversation) {
            throw new Error("Conversación no encontrada.");
        }

        return prisma.conversation.update({
            where: {
                id: conversation.id
            },
            data: {
                status: ConversationStatus.CLOSED,
                operationalStatus: ConversationOperationalStatus.RESOLVED,
                closedAt: new Date()
            }
        });
    }

    static async reopenConversation(workspaceId: string, conversationId: string) {
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                workspaceId
            }
        });

        if (!conversation) {
            throw new Error("Conversación no encontrada.");
        }

        return prisma.conversation.update({
            where: {
                id: conversation.id
            },
            data: {
                status: ConversationStatus.OPEN,
                operationalStatus: conversation.assignedUserId
                    ? ConversationOperationalStatus.ASSIGNED
                    : ConversationOperationalStatus.UNASSIGNED,
                closedAt: null
            }
        });
    }

    /**
     * Borra definitivamente todos los mensajes de una conversación. No
     * toca el contacto ni la conversación, solo el contenido del hilo.
     */
    static async purgeMessages(
        workspaceId: string,
        conversationId: string,
        actorId: string
    ) {
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                workspaceId
            },
            select: {
                id: true
            }
        });

        if (!conversation) {
            throw new Error("Conversación no encontrada.");
        }

        const deleted = await prisma.message.deleteMany({
            where: {
                conversationId,
                workspaceId
            }
        });

        await prisma.conversation.update({
            where: {
                id: conversationId
            },
            data: {
                lastMessageAt: null
            }
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.WARN,
            module: LogModule.CONVERSATION,
            action: "CONVERSATION_PURGED",
            message: "Se borraron definitivamente los mensajes de la conversación.",
            payload: {
                conversationId,
                actorId,
                deletedMessages: deleted.count
            }
        });

        return deleted.count;
    }

    static async addLocalSystemMessage(
        workspaceId: string,
        conversationId: string,
        body: string
    ) {
        const message = await prisma.message.create({
            data: {
                workspaceId,
                conversationId,
                direction: MessageDirection.OUT,
                type: "TEXT",
                status: "CREATED",
                source: "AUTOMATIC",
                body
            }
        });

        await prisma.conversation.update({
            where: {
                id: conversationId
            },
            data: {
                lastMessageAt: message.createdAt
            }
        });

        return message;
    }
}
