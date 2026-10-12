import { LogLevel, LogModule } from "@prisma/client";

import { prisma } from "../config/prisma";
import { deleteWorkspaceMedia } from "./media-storage.service";
import { LogService } from "./log.service";

export class WorkspaceService {
    /** Cuánta información hay, para que el borrado no sea a ciegas. */
    static async getDataSummary(workspaceId: string) {
        const [workspace, contacts, conversations, messages, campaigns, templates, users] =
            await Promise.all([
                prisma.workspace.findUnique({
                    where: {
                        id: workspaceId
                    },
                    select: {
                        name: true,
                        slug: true
                    }
                }),
                prisma.contact.count({ where: { workspaceId } }),
                prisma.conversation.count({ where: { workspaceId } }),
                prisma.message.count({ where: { workspaceId } }),
                prisma.campaign.count({ where: { workspaceId } }),
                prisma.template.count({ where: { workspaceId } }),
                prisma.user.count({ where: { workspaceId } })
            ]);

        return {
            name: workspace?.name || "",
            slug: workspace?.slug || "",
            contacts,
            conversations,
            messages,
            campaigns,
            templates,
            users
        };
    }

    /**
     * Elimina todos los datos de la instalación: mensajes, conversaciones,
     * contactos, campañas, plantillas, usuarios, credenciales y archivos.
     *
     * Se usa al terminar un contrato, para entregar el sistema sin datos
     * del cliente. La confirmación es el identificador de la instalación,
     * así que no se dispara por accidente.
     */
    static async purgeWorkspace(workspaceId: string, confirmation: string) {
        const workspace = await prisma.workspace.findUnique({
            where: {
                id: workspaceId
            }
        });

        if (!workspace) {
            throw new Error("Instalación no encontrada.");
        }

        if (
            confirmation.trim().toLowerCase() !== workspace.slug.toLowerCase()
        ) {
            throw new Error(
                `Para confirmar, escribe el identificador de la instalación: ${workspace.slug}`
            );
        }

        const summary = await this.getDataSummary(workspaceId);

        /**
         * La bitácora no se borra en cascada con el workspace, así que se
         * elimina aparte: de lo contrario los datos del cliente seguirían
         * ahí. Los archivos tampoco: viven en el disco.
         */
        await prisma.log.deleteMany({
            where: {
                workspaceId
            }
        });

        deleteWorkspaceMedia(workspaceId);

        /**
         * El resto se borra en cascada desde el workspace (contactos,
         * conversaciones, mensajes, campañas, plantillas, usuarios,
         * sesiones, credenciales y eventos de webhook).
         */
        await prisma.workspace.delete({
            where: {
                id: workspace.id
            }
        });

        /**
         * El registro queda sin workspace a propósito: es la constancia de
         * que el borrado ocurrió, y no debe desaparecer con los datos.
         */
        await LogService.create({
            level: LogLevel.WARN,
            module: LogModule.SYSTEM,
            action: "WORKSPACE_PURGED",
            message: "Se eliminaron todos los datos de una instalación.",
            payload: {
                workspaceId: workspace.id,
                slug: workspace.slug,
                name: workspace.name,
                deleted: summary
            }
        });

        return {
            workspaceName: workspace.name,
            deleted: summary
        };
    }
}
