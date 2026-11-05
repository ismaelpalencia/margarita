import bcrypt from "bcrypt";
import {
    LogLevel,
    LogModule,
    UserRole,
    UserStatus,
    WorkspaceProfile,
    WorkspaceStatus
} from "@prisma/client";

import { prisma } from "../config/prisma";
import { LogService } from "./log.service";
import { emailIndex } from "../utils/email";

export type CreateWorkspaceInput = {
    workspaceName: string;
    workspaceSlug: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
    /** Giro con el que arranca la instalación. */
    profile?: WorkspaceProfile;
};

/**
 * Alta inicial de una instalación.
 *
 * Antes el workspace y el admin solo se podían crear con el seed, que exige
 * consola y variables de entorno. Esto permite hacerlo desde el navegador
 * en un despliegue nuevo, y deja el seed como herramienta para reinstalar o
 * reconfigurar una instalación existente.
 */
export class SetupService {
    /**
     * Una instalación está configurada en cuanto existe un workspace. Es la
     * condición que cierra el asistente de alta.
     */
    static async isConfigured(): Promise<boolean> {
        const count = await prisma.workspace.count();

        return count > 0;
    }

    static async createWorkspace(input: CreateWorkspaceInput) {
        if (await this.isConfigured()) {
            throw new Error(
                "Esta instalación ya está configurada. Entra con tu usuario."
            );
        }

        const workspace = await prisma.workspace.create({
            data: {
                name: input.workspaceName,
                slug: input.workspaceSlug,
                status: WorkspaceStatus.ACTIVE,
                profile: input.profile ?? WorkspaceProfile.GENERICO,
                settings: {
                    create: {}
                }
            }
        });

        const admin = await prisma.user.create({
            data: {
                workspaceId: workspace.id,
                name: input.adminName,
                email: input.adminEmail,
                emailHash: emailIndex(input.adminEmail),
                password: await bcrypt.hash(input.adminPassword, 12),
                role: UserRole.ADMIN,
                status: UserStatus.OFFLINE,
                isActive: true,
                canSendManualMessages: true
            }
        });

        await LogService.create({
            workspaceId: workspace.id,
            level: LogLevel.INFO,
            module: LogModule.SYSTEM,
            action: "WORKSPACE_CREATED_FROM_SETUP",
            message: "Instalación configurada desde el navegador.",
            payload: {
                workspaceId: workspace.id,
                slug: workspace.slug,
                adminEmail: admin.email
            }
        });

        return {
            workspaceId: workspace.id,
            adminEmail: admin.email
        };
    }
}
