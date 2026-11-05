import {
    ConversationOperationalStatus,
    ConversationSource,
    ConversationStatus,
    LogLevel,
    LogModule,
    MessageDirection,
    Prisma,
    UserRole
} from "@prisma/client";

import { prisma } from "../config/prisma";
import { contactSearchOr } from "../utils/contact-search";
import { emitToWorkspaceAndUsers } from "../sockets";
import { BadgeService } from "./badge.service";
import { describeMetaError } from "../utils/meta-error";
import { LogService } from "./log.service";

type ListConversationsParams = {
    workspaceId: string;
    userId?: string;
    role: "ADMIN" | "AGENT";
    status?: string;
    whatsappNumberId?: string;
};

export type InboxFilters = {
    status?: string;
    search?: string;
    /**
     * `userId` para las asignadas a esa persona, `null` para las que no
     * tienen dueño y `undefined` para no filtrar.
     */
    assignedTo?: string | null;
    onlyUnread?: boolean;
};

export class ConversationService {
    /**
     * El número con el que se abre una conversación nueva es el activo de
     * la sesión; sin él no se puede iniciar un hilo.
     */
    static requireActiveNumberId(req: {
        activeNumber?: { id: string } | null;
    }): string {
        if (!req.activeNumber) {
            throw new Error(
                "No hay un número de WhatsApp activo. Configúralo en Admin → WhatsApp."
            );
        }

        return req.activeNumber.id;
    }

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
                    : {}),
                ...(params.whatsappNumberId
                    ? {
                          whatsappNumberId: params.whatsappNumberId
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

    /**
     * Condiciones de la bandeja: número activo, estado, búsqueda por
     * contacto y filtros de asignación y no leídos.
     */
    private static inboxWhere(params: {
        workspaceId: string;
        whatsappNumberId?: string;
        filters?: InboxFilters;
        /** Restricción fija: un agente solo ve lo suyo. */
        restrictToUserId?: string;
    }): Prisma.ConversationWhereInput {
        const filters = params.filters || {};
        const search = filters.search?.trim() || "";

        const assignedTo =
            filters.assignedTo === null
                ? null
                : params.restrictToUserId !== undefined
                  ? params.restrictToUserId
                  : filters.assignedTo;

        return {
            workspaceId: params.workspaceId,
            ...(params.whatsappNumberId
                ? { whatsappNumberId: params.whatsappNumberId }
                : {}),
            ...(filters.status
                ? { status: filters.status as ConversationStatus }
                : {}),
            ...(filters.onlyUnread ? { unreadCount: { gt: 0 } } : {}),
            ...(assignedTo === null
                ? { assignedUserId: null }
                : assignedTo
                  ? { assignedUserId: assignedTo }
                  : {}),
            ...(search ? { contact: { OR: contactSearchOr(search) } } : {})
        };
    }

    static async listForAdmin(
        workspaceId: string,
        whatsappNumberId?: string,
        filters?: InboxFilters
    ) {
        return prisma.conversation.findMany({
            where: this.inboxWhere({
                workspaceId,
                whatsappNumberId,
                filters
            }),
            include: {
                contact: true,
                assignedUser: true,
                whatsappNumber: {
                    select: {
                        displayName: true,
                        phoneNumber: true
                    }
                },
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

    static async listForAgent(
        workspaceId: string,
        agentId: string,
        whatsappNumberId?: string,
        filters?: InboxFilters
    ) {
        return prisma.conversation.findMany({
            where: this.inboxWhere({
                workspaceId,
                whatsappNumberId,
                filters,
                restrictToUserId: agentId
            }),
            include: {
                contact: true,
                assignedUser: true,
                whatsappNumber: {
                    select: {
                        displayName: true,
                        phoneNumber: true
                    }
                },
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

    /**
     * Al abrir un hilo, sus mensajes entrantes dejan de contar como no
     * leídos. El contador es por conversación, no por persona: si otro
     * usuario tenía el hilo abierto, el aviso desaparece para todos.
     */
    static async markAsRead(workspaceId: string, conversationId: string) {
        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, workspaceId },
            select: { assignedUserId: true, unreadCount: true }
        });

        if (!conversation || conversation.unreadCount <= 0) {
            return;
        }

        await prisma.conversation.updateMany({
            where: {
                id: conversationId,
                workspaceId,
                unreadCount: {
                    gt: 0
                }
            },
            data: {
                unreadCount: 0
            }
        });

        /** Otras pestañas y el resto del equipo se enteran del decremento. */
        emitToWorkspaceAndUsers(
            workspaceId,
            [conversation.assignedUserId],
            "conversation:read",
            { conversationId }
        );

        await BadgeService.broadcast(workspaceId);
    }

    /** Total de mensajes sin leer, para el aviso del encabezado. */
    static async countUnread(params: {
        workspaceId: string;
        whatsappNumberId?: string;
        assignedUserId?: string;
    }): Promise<number> {
        const result = await prisma.conversation.aggregate({
            where: {
                workspaceId: params.workspaceId,
                ...(params.whatsappNumberId
                    ? { whatsappNumberId: params.whatsappNumberId }
                    : {}),
                ...(params.assignedUserId
                    ? { assignedUserId: params.assignedUserId }
                    : {}),
                unreadCount: {
                    gt: 0
                }
            },
            _sum: {
                unreadCount: true
            }
        });

        return result._sum.unreadCount ?? 0;
    }

    static async openFromContact(
        workspaceId: string,
        contactId: string,
        whatsappNumberId: string
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
                whatsappNumberId_contactId: {
                    whatsappNumberId,
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
                whatsappNumberId,
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
                whatsappNumber: {
                    select: {
                        displayName: true,
                        phoneNumber: true
                    }
                },
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
                whatsappNumber: {
                    select: {
                        displayName: true,
                        phoneNumber: true
                    }
                },
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
        whatsappNumberId: string,
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
                whatsappNumberId_contactId: {
                    whatsappNumberId,
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
                whatsappNumberId,
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

    emitToWorkspaceAndUsers(
        workspaceId,
        [conversation.assignedUserId, agent?.id],
        "conversation:assigned",
        {
            conversationId: conversation.id,
            assignedUserId: agent ? agent.id : null,
            agentName: agent ? agent.name : null,
            reason: "MANUAL"
        }
    );

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

    /** Conversaciones abiertas sin dueño (para el badge «Sin asignar»). */
    static async countUnassigned(workspaceId: string): Promise<number> {
        return prisma.conversation.count({
            where: {
                workspaceId,
                assignedUserId: null,
                status: ConversationStatus.OPEN
            }
        });
    }

    /**
     * Un agente o admin reclama una conversación sin asignar.
     */
    static async claim(
        workspaceId: string,
        conversationId: string,
        userId: string
    ) {
        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, workspaceId },
            select: { id: true, assignedUserId: true }
        });

        if (!conversation) {
            throw new Error("Conversación no encontrada.");
        }

        const updated = await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                assignedUserId: userId,
                operationalStatus: ConversationOperationalStatus.ASSIGNED,
                status: ConversationStatus.OPEN,
                closedAt: null
            }
        });

        await prisma.assignmentHistory.create({
            data: {
                conversationId,
                fromUserId: conversation.assignedUserId,
                toUserId: userId,
                assignedById: userId,
                reason: "CLAIMED"
            }
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.INFO,
            module: LogModule.CONVERSATION,
            action: "HANDOFF_CLAIMED",
            message: "La conversación sin asignar fue reclamada.",
            payload: { conversationId, userId }
        }).catch(() => undefined);

        emitToWorkspaceAndUsers(workspaceId, [userId], "conversation:assigned", {
            conversationId,
            assignedUserId: userId,
            reason: "CLAIMED",
            fallback: false
        });

        await BadgeService.broadcast(workspaceId);

        return updated;
    }
}
