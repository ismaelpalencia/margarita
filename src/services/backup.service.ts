import { prisma } from "../config/prisma";
import { maskSecret } from "../utils/mask";
import { toCsv, CsvCell } from "../utils/csv";

/**
 * Copia de seguridad de los datos del workspace.
 *
 * No incluye credenciales: los tokens de Meta se exportan enmascarados.
 * Un archivo de respaldo suele terminar en un correo o en un disco
 * compartido, y ahí un token en claro es un riesgo innecesario.
 * Tampoco incluye los hashes de contraseña.
 */

export const BACKUP_ENTITIES = [
    "contacts",
    "conversations",
    "messages",
    "campaigns",
    "templates",
    "users",
    "logs"
] as const;

export type BackupEntity = (typeof BACKUP_ENTITIES)[number];

export const MAX_ROWS = Number(process.env.BACKUP_MAX_ROWS) || 20000;

export function isBackupEntity(value: string): value is BackupEntity {
    return (BACKUP_ENTITIES as readonly string[]).includes(value);
}

export class BackupService {
    static async collect(workspaceId: string) {
        const [workspace, users, contacts, conversations, messages, campaigns, templates, logs] =
            await Promise.all([
                prisma.workspace.findUnique({
                    where: { id: workspaceId },
                    include: { settings: true }
                }),
                prisma.user.findMany({
                    where: { workspaceId },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                        status: true,
                        isActive: true,
                        lastLoginAt: true,
                        createdAt: true
                    }
                }),
                prisma.contact.findMany({
                    where: { workspaceId },
                    include: { tags: { include: { tag: true } } }
                }),
                prisma.conversation.findMany({
                    where: { workspaceId },
                    include: {
                        contact: { select: { phone: true, customName: true, profileName: true } },
                        assignedUser: { select: { name: true, email: true } }
                    }
                }),
                prisma.message.findMany({
                    where: { workspaceId },
                    orderBy: { createdAt: "desc" },
                    take: MAX_ROWS,
                    include: {
                        conversation: {
                            select: {
                                contact: { select: { phone: true } }
                            }
                        }
                    }
                }),
                prisma.campaign.findMany({
                    where: { workspaceId },
                    include: {
                        template: { select: { name: true, language: true } },
                        createdBy: { select: { name: true, email: true } }
                    }
                }),
                prisma.template.findMany({ where: { workspaceId } }),
                prisma.log.findMany({
                    where: { workspaceId },
                    orderBy: { createdAt: "desc" },
                    take: 5000
                })
            ]);

        const account = await prisma.whatsAppAccount.findUnique({
            where: { workspaceId },
            include: {
                numbers: {
                    orderBy: { createdAt: "asc" }
                }
            }
        });

        return {
            generatedAt: new Date().toISOString(),
            app: "Margarita",
            notes: [
                "Las credenciales de Meta no se incluyen: vuelve a capturarlas desde Admin → WhatsApp.",
                "Las contraseñas de los usuarios no se incluyen por seguridad.",
                `Se exportan hasta ${MAX_ROWS} mensajes (los más recientes) y 5000 entradas de bitácora.`
            ],
            workspace,
            settings: workspace?.settings || null,
            whatsappAccount: account
                ? {
                      businessAccountId: account.businessAccountId,
                      apiVersion: account.apiVersion,
                      numbers: account.numbers.map((number) => ({
                          phoneNumberId: number.phoneNumberId,
                          phoneNumber: number.phoneNumber,
                          displayName: number.displayName,
                          status: number.status,
                          qualityRating: number.qualityRating,
                          isActive: number.isActive
                      })),
                      accessToken: maskSecret(account.accessToken),
                      verifyToken: maskSecret(account.verifyToken)
                  }
                : null,
            users,
            contacts: contacts.map((contact) => ({
                ...contact,
                tags: contact.tags.map((item) => item.tag.name)
            })),
            conversations,
            messages,
            campaigns,
            templates,
            logs
        };
    }

    static async toCsv(workspaceId: string, entity: BackupEntity) {
        switch (entity) {
            case "contacts": {
                const contacts = await prisma.contact.findMany({
                    where: { workspaceId },
                    include: { tags: { include: { tag: true } } },
                    orderBy: { createdAt: "desc" }
                });

                const rows = contacts.map((contact) => ({
                    id: contact.id,
                    nombre: contact.customName || contact.profileName || "",
                    telefono: contact.phone,
                    etiquetas: contact.tags.map((item) => item.tag.name).join(", "),
                    activo: contact.isActive,
                    notas: contact.notes || "",
                    creado: contact.createdAt
                }));

                return {
                    filename: "contactos.csv",
                    content: toCsv(rows, [
                        "id",
                        "nombre",
                        "telefono",
                        "etiquetas",
                        "activo",
                        "notas",
                        "creado"
                    ])
                };
            }

            case "conversations": {
                const conversations = await prisma.conversation.findMany({
                    where: { workspaceId },
                    include: {
                        contact: true,
                        assignedUser: { select: { name: true } }
                    },
                    orderBy: { createdAt: "desc" }
                });

                const rows = conversations.map((conversation) => ({
                    id: conversation.id,
                    contacto:
                        conversation.contact.customName ||
                        conversation.contact.profileName ||
                        "",
                    telefono: conversation.contact.phone,
                    estado: conversation.status,
                    operacion: conversation.operationalStatus,
                    origen: conversation.source,
                    asignada: conversation.assignedUser?.name || "",
                    ultimoMensaje: conversation.lastMessageAt,
                    ultimoEntrante: conversation.lastIncomingMessageAt,
                    creada: conversation.createdAt
                }));

                return {
                    filename: "conversaciones.csv",
                    content: toCsv(rows, [
                        "id",
                        "contacto",
                        "telefono",
                        "estado",
                        "operacion",
                        "origen",
                        "asignada",
                        "ultimoMensaje",
                        "ultimoEntrante",
                        "creada"
                    ])
                };
            }

            case "campaigns": {
                const campaigns = await prisma.campaign.findMany({
                    where: { workspaceId },
                    include: {
                        template: { select: { name: true, language: true } },
                        _count: { select: { recipients: true } }
                    },
                    orderBy: { createdAt: "desc" }
                });

                const rows = campaigns.map((campaign) => ({
                    id: campaign.id,
                    nombre: campaign.name,
                    estado: campaign.status,
                    plantilla: `${campaign.template.name} (${campaign.template.language})`,
                    destinatarios: campaign._count.recipients,
                    validos: campaign.validRecipients,
                    invalidos: campaign.invalidRecipients,
                    duplicados: campaign.duplicateRecipients,
                    iniciada: campaign.startedAt,
                    terminada: campaign.finishedAt,
                    creada: campaign.createdAt
                }));

                return {
                    filename: "campanas.csv",
                    content: toCsv(rows, [
                        "id",
                        "nombre",
                        "estado",
                        "plantilla",
                        "destinatarios",
                        "validos",
                        "invalidos",
                        "duplicados",
                        "iniciada",
                        "terminada",
                        "creada"
                    ])
                };
            }

            case "users": {
                const users = await prisma.user.findMany({
                    where: { workspaceId },
                    orderBy: { createdAt: "asc" }
                });

                const rows = users.map((user) => ({
                    id: user.id,
                    nombre: user.name,
                    correo: user.email,
                    rol: user.role,
                    estado: user.status,
                    activo: user.isActive,
                    ultimoAcceso: user.lastLoginAt,
                    creado: user.createdAt
                }));

                return {
                    filename: "usuarios.csv",
                    content: toCsv(rows, [
                        "id",
                        "nombre",
                        "correo",
                        "rol",
                        "estado",
                        "activo",
                        "ultimoAcceso",
                        "creado"
                    ])
                };
            }

            case "templates": {
                const templates = await prisma.template.findMany({
                    where: { workspaceId },
                    orderBy: { name: "asc" }
                });

                const rows = templates.map((template) => ({
                    id: template.id,
                    nombre: template.name,
                    idioma: template.language,
                    categoria: template.category || "",
                    estado: template.status,
                    metaId: template.metaTemplateId || "",
                    sincronizada: template.lastSyncedAt
                }));

                return {
                    filename: "plantillas.csv",
                    content: toCsv(rows, [
                        "id",
                        "nombre",
                        "idioma",
                        "categoria",
                        "estado",
                        "metaId",
                        "sincronizada"
                    ])
                };
            }

            case "logs": {
                const logs = await prisma.log.findMany({
                    where: { workspaceId },
                    orderBy: { createdAt: "desc" },
                    take: MAX_ROWS
                });

                const rows = logs.map((log) => ({
                    fecha: log.createdAt,
                    nivel: log.level,
                    modulo: log.module,
                    accion: log.action,
                    mensaje: log.message,
                    detalle: log.payload ? JSON.stringify(log.payload) : ""
                }));

                return {
                    filename: "bitacora.csv",
                    content: toCsv(rows, [
                        "fecha",
                        "nivel",
                        "modulo",
                        "accion",
                        "mensaje",
                        "detalle"
                    ])
                };
            }

            default: {
                const messages = await prisma.message.findMany({
                    where: { workspaceId },
                    orderBy: { createdAt: "desc" },
                    take: MAX_ROWS,
                    include: {
                        conversation: {
                            include: {
                                contact: { select: { phone: true } }
                            }
                        },
                        sentByUser: { select: { name: true } }
                    }
                });

                const rows = messages.map((message) => ({
                    id: message.id,
                    conversacion: message.conversationId,
                    telefono: message.conversation.contact.phone,
                    direccion: message.direction,
                    tipo: message.type,
                    estado: message.status,
                    origen: message.source,
                    autor: message.sentByUser?.name || "",
                    mensaje: message.body || "",
                    wamid: message.wamid || "",
                    eliminado: message.deletedAt ? "si" : "",
                    fecha: message.createdAt
                }));

                return {
                    filename: "mensajes.csv",
                    content: toCsv(rows, [
                        "id",
                        "conversacion",
                        "telefono",
                        "direccion",
                        "tipo",
                        "estado",
                        "origen",
                        "autor",
                        "mensaje",
                        "wamid",
                        "eliminado",
                        "fecha"
                    ])
                };
            }
        }
    }
}
