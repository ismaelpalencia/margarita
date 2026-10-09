import { prisma } from "../config/prisma";
import {
    CreateContactInput,
    UpdateContactInput
} from "../validations/contact.validation";
import { normalizeMexicanPhone } from "../utils/phone";

type ListContactsParams = {
    workspaceId: string;
    search?: string;
    tagId?: string;
};

export class ContactService {
    static async listContacts(params: ListContactsParams) {
        const search = params.search?.trim();

        return prisma.contact.findMany({
            where: {
                workspaceId: params.workspaceId,
                isActive: true,
                ...(search
                    ? {
                          OR: [
                              {
                                  customName: {
                                      contains: search,
                                      mode: "insensitive"
                                  }
                              },
                              {
                                  profileName: {
                                      contains: search,
                                      mode: "insensitive"
                                  }
                              },
                              {
                                  phone: {
                                      contains: search.replace(/\D/g, "")
                                  }
                              }
                          ]
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

        const validTagIds = await this.getValidTagIds(workspaceId, input.tagIds);

        const existingContact = await prisma.contact.findUnique({
            where: {
                workspaceId_phone: {
                    workspaceId,
                    phone
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
                phone,
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
