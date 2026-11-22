import { LogLevel, LogModule, WorkspaceProfile } from "@prisma/client";
import { Request, Response } from "express";

import { prisma } from "../config/prisma";
import { LogService } from "../services/log.service";
import { ConversationService } from "../services/conversation.service";
import { AiUsageService } from "../services/aiUsage.service";
import { SendPolicyService } from "../services/send-policy.service";
import { SystemStatusService } from "../services/system-status.service";
import { WorkspaceService } from "../services/workspace.service";
import { appConfig } from "../config/app.config";
import { probeObjectStorage } from "../services/object-storage.service";
import { storageSummary, StorageSummary } from "../services/object-storage.service";
import {
    WORKSPACE_PROFILE_DESCRIPTIONS,
    WORKSPACE_PROFILE_LABELS,
    WORKSPACE_PROFILES,
    parseWorkspaceProfile
} from "../utils/workspace-profile";

/**
 * El listado del bucket se cachea cinco minutos: no cambia cada segundo y
 * listar en cada carga del panel sería desperdiciar peticiones a Cloudflare.
 */
let r2Cache: { at: number; value: StorageSummary | null } | null = null;

async function r2Summary(): Promise<StorageSummary | null> {
    if (r2Cache && Date.now() - r2Cache.at < 5 * 60 * 1000) {
        return r2Cache.value;
    }

    let value: StorageSummary | null = null;

    try {
        value = await storageSummary();
    } catch {
        value = null;
    }

    r2Cache = { at: Date.now(), value };

    return value;
}

export class AdminSystemController {
    /**
     * Prueba de Cloudflare R2. Devuelve el error tal cual para no adivinar:
     * permisos del token, bucket inexistente o llaves mal copiadas.
     */
    static async testR2(_req: Request, res: Response) {
        const result = await probeObjectStorage();

        return res.status(result.ok ? 200 : 502).json(result);
    }

    static async index(req: Request, res: Response) {
        const status = await SystemStatusService.getAdminStatus(
            req.user!.workspaceId
        );
        const currentProfile =
            status.workspace?.profile ?? WorkspaceProfile.GENERICO;
        /**
         * COBRANZA ya no se ofrece como giro nuevo, pero una instalación que
         * nació con él debe poder conservarlo (y volver a él si lo cambió).
         */
        const profiles = WORKSPACE_PROFILES.filter(
            (profile) =>
                profile !== WorkspaceProfile.COBRANZA ||
                currentProfile === WorkspaceProfile.COBRANZA
        );
        const workspaceFlags = await prisma.workspace.findUnique({
            where: { id: req.user!.workspaceId },
            select: {
                interactiveListsEnabled: true,
                handoffEscalationMinutes: true,
                autoAssignToAdmin: true
            }
        });
        const unassignedCount = await ConversationService.countUnassigned(
            req.user!.workspaceId
        );

        const aiTimezone = await SendPolicyService.timezoneFor(
            req.user!.workspaceId
        );
        const aiUsage = await AiUsageService.getCurrentMonthUsage(
            req.user!.workspaceId,
            aiTimezone
        );

        const data = {
            status: {
                workspace: status.workspace ? { profile: status.workspace.profile, status: status.workspace.status } : null,
                whatsappAccount: status.whatsappAccount ? { businessAccountId: status.whatsappAccount.businessAccountId, apiVersion: status.whatsappAccount.apiVersion } : null,
                approvedTemplates: status.approvedTemplates,
                totalTemplates: status.totalTemplates,
                totalContacts: status.totalContacts,
                activeAgents: status.activeAgents,
                recentErrors: status.recentErrors.map(({ action, level, message, createdAt }) => ({ action, level, message, createdAt })),
                recentWebhookLogs: status.recentWebhookLogs.map(({ action, level, message, createdAt }) => ({ action, level, message, createdAt })),
                recentMetaLogs: status.recentMetaLogs.map(({ action, level, message, createdAt }) => ({ action, level, message, createdAt })),
                webhookUrl: status.webhookUrl,
                pendingWebhookEvents: status.pendingWebhookEvents,
                failedWebhookEvents: status.failedWebhookEvents,
                hardening: status.hardening,
                checks: status.checks
            },
            version: appConfig.version,
            commit: appConfig.commit,
            r2: await r2Summary(),
            profiles,
            currentProfile,
            profileLabels: WORKSPACE_PROFILE_LABELS,
            profileDescriptions: WORKSPACE_PROFILE_DESCRIPTIONS,
            interactiveListsEnabled: Boolean(workspaceFlags?.interactiveListsEnabled),
            handoffEscalationMinutes: workspaceFlags?.handoffEscalationMinutes ?? 15,
            autoAssignToAdmin: Boolean(workspaceFlags?.autoAssignToAdmin ?? true),
            unassignedCount,
            aiUsage,
            success: req.query.success || null,
            error: req.query.error || null
        };

        if (req.accepts("json") && !req.accepts("html")) return res.json(data);
        return res.redirect("/panel/admin/system");

    }

    /** Interruptor de listas interactivas (no depende del giro). */
    static async updateInteractiveLists(req: Request, res: Response) {
        const enabled = req.body?.interactiveListsEnabled === "true";

        try {
            await prisma.workspace.update({
                where: { id: req.user!.workspaceId },
                data: { interactiveListsEnabled: enabled }
            });

            await LogService.create({
                workspaceId: req.user!.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.SYSTEM,
                action: "WORKSPACE_INTERACTIVE_LISTS_CHANGED",
                message: enabled
                    ? "Se activaron las listas interactivas."
                    : "Se desactivaron las listas interactivas.",
                payload: { enabled }
            }).catch(() => undefined);
        } catch {
            return res.redirect("/panel/admin/system?error=lists");
        }

        return res.redirect("/panel/admin/system?success=lists");
    }

    /** Configuración de asignación y escalamiento de handoff. */
    static async saveHandoff(req: Request, res: Response) {
        const minutes = Number(req.body?.handoffEscalationMinutes) || 15;
        const autoAssignToAdmin = req.body?.autoAssignToAdmin === "true";

        try {
            await prisma.workspace.update({
                where: { id: req.user!.workspaceId },
                data: {
                    handoffEscalationMinutes: Math.max(1, Math.min(1440, minutes)),
                    autoAssignToAdmin
                }
            });
        } catch {
            return res.redirect("/panel/admin/system?error=handoff");
        }

        return res.redirect("/panel/admin/system?success=handoff");
    }

    /**
     * Cambia el giro de la instalación desde el panel.
     *
     * Es un interruptor, no una migración: los datos de cobranza se quedan
     * guardados y solo se ocultan las pantallas que no aplican al giro nuevo.
     */
    static async updateProfile(req: Request, res: Response) {
        const profile = parseWorkspaceProfile(req.body?.profile);

        if (!profile) {
            return res.redirect("/panel/admin/system?error=profile");
        }

        try {
            await WorkspaceService.updateProfile(
                req.user!.workspaceId,
                profile,
                req.user!.id
            );
        } catch {
            return res.redirect("/panel/admin/system?error=profile");
        }

        return res.redirect("/panel/admin/system?success=profile");
    }
}
