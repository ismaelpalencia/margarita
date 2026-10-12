import { prisma } from "../config/prisma";
import { LogLevel, LogModule } from "@prisma/client";
import { contactSearchOr } from "../utils/contact-search";
import { LogService } from "./log.service";
import {
    CreateContactInput,
    UpdateContactInput
} from "../validations/contact.validation";
import { contactPhoneFields, normalizeMexicanPhone } from "../utils/phone";

type ListContactsParams = {
    workspaceId: string;
    search?: string;
    tagId?: string;
    /** Solo los contactos que pidieron la baja. */
    onlyOptedOut?: boolean;
};

export class ContactService {
    static async listContacts(params: ListContactsParams) {
        const search = params.search?.trim();

        return prisma.contact.findMany({
            where: {
                workspaceId: params.workspaceId,
                isActive: true,
                ...(search ? { OR: contactSearchOr(search) } : {}),
                ...(params.onlyOptedOut
                    ? {
                          optOutAt: {
                              not: null
                          }
                      }
                    : {}),
                ...(params.tagId
                    ? {
                          tags: {
                              some: {
                                  tagId: params.tagId,
                                  tag: {
                                      isActive: true,
                                      workspaceId: params.workspaceId
                                  }
                              }
                          }
                      }
                    : {})
            },
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
            },
            orderBy: {
                createdAt: "desc"
            }
        });
    }

    static async createContact(workspaceId: string, input: CreateContactInput) {
        const phone = normalizeMexicanPhone(input.phone);
        const phoneFields = contactPhoneFields(phone);

        const validTagIds = await this.getValidTagIds(workspaceId, input.tagIds);

        const existingContact = await prisma.contact.findUnique({
            where: {
                workspaceId_phoneHash: {
                    workspaceId,
                    phoneHash: phoneFields.phoneHash
                }
            }
        });

        if (existingContact && existingContact.isActive) {
            throw new Error("Ya existe un contacto activo con ese teléfono.");
        }

        if (existingContact && !existingContact.isActive) {
            return prisma.contact.update({
                where: {
                    id: existingContact.id
                },
                data: {
                    customName: input.customName,
                    notes: input.notes,
                    isActive: true,
                    tags: {
                        deleteMany: {},
                        create: validTagIds.map((tagId) => ({
                            tagId
                        }))
                    }
                }
            });
        }

        return prisma.contact.create({
            data: {
                workspaceId,
                customName: input.customName,
                ...phoneFields,
                notes: input.notes,
                isActive: true,
                tags: {
                    create: validTagIds.map((tagId) => ({
                        tagId
                    }))
                }
            }
        });
    }

    static async getContactById(workspaceId: string, contactId: string) {
        const contact = await prisma.contact.findFirst({
            where: {
                id: contactId,
                workspaceId,
                isActive: true
            },
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
        });

        if (!contact) {
            throw new Error("Contacto no encontrado.");
        }

        return contact;
    }

    static async updateContact(
        workspaceId: string,
        contactId: string,
        input: UpdateContactInput
    ) {
        await this.getContactById(workspaceId, contactId);

        const validTagIds = await this.getValidTagIds(workspaceId, input.tagIds);

        return prisma.contact.update({
            where: {
                id: contactId
            },
            data: {
                customName: input.customName,
                notes: input.notes,
                tags: {
                    deleteMany: {},
                    create: validTagIds.map((tagId) => ({
                        tagId
                    }))
                }
            }
        });
    }

    static async deactivateContact(workspaceId: string, contactId: string) {
        await this.getContactById(workspaceId, contactId);

        return prisma.contact.update({
            where: {
                id: contactId
            },
            data: {
                isActive: false
            }
        });
    }

    /**
     * Marca la baja a mano, por ejemplo cuando el cliente la pidió por
     * teléfono o en persona. A partir de ahí no se le envía nada.
     */
    static async setOptOut(
        workspaceId: string,
        contactId: string,
        source: "admin" | "keyword"
    ) {
        await this.getContactById(workspaceId, contactId);

        const contact = await prisma.contact.update({
            where: {
                id: contactId
            },
            data: {
                optOutAt: new Date(),
                optOutSource: source
            }
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.WARN,
            module: LogModule.CONTACT,
            action: "CONTACT_OPT_OUT_MANUAL",
            message: "Se marcó la baja de un contacto.",
            payload: {
                contactId,
                source
            }
        });

        return contact;
    }

    /**
     * Reactiva a un contacto que había pedido la baja y deja registrado el
     * consentimiento nuevo. Es una decisión explícita del operador: la
     * herramienta no la toma sola.
     */
    static async setOptIn(workspaceId: string, contactId: string) {
        const before = await this.getContactById(workspaceId, contactId);

        const contact = await prisma.contact.update({
            where: {
                id: contactId
            },
            data: {
                optOutAt: null,
                optOutSource: null,
                optInAt: new Date()
            }
        });

        if (before.optOutAt) {
            await LogService.create({
                workspaceId,
                level: LogLevel.INFO,
                module: LogModule.CONTACT,
                action: "CONTACT_OPT_IN",
                message: "Se reactivó a un contacto que había pedido la baja.",
                payload: {
                    contactId
                }
            });
        }

        return contact;
    }

    private static async getValidTagIds(workspaceId: string, tagIds: string[]) {
        if (!tagIds.length) return [];

        const tags = await prisma.tag.findMany({
            where: {
                workspaceId,
                isActive: true,
                id: {
                    in: tagIds
                }
            },
            select: {
                id: true
            }
        });

        return tags.map((tag) => tag.id);
    }
}
