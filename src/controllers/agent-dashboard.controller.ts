import { Request, Response } from "express";
import { UserStatus } from "@prisma/client";

import { AgentService } from "../services/agent.service";
import { DashboardService } from "../services/dashboard.service";
import { ConversationService } from "../services/conversation.service";

export class AgentDashboardController {
    static async index(req: Request, res: Response) {
        const dashboard = await DashboardService.getAgentDashboard(
            req.user!.workspaceId,
            req.user!.id
        );

        return res.render("pages/agent/dashboard", {
            user: req.user,
            dashboard,
            unassignedCount: await ConversationService.countUnassigned(
                req.user!.workspaceId
            ),
            success: req.query.success || null,
            error: req.query.error || null
        });
    }

    static async data(req: Request, res: Response) {
        const [dashboard, unassignedCount] = await Promise.all([
            DashboardService.getAgentDashboard(
                req.user!.workspaceId,
                req.user!.id
            ),
            ConversationService.countUnassigned(req.user!.workspaceId)
        ]);

        return res.json({
            user: { name: req.user!.name, role: req.user!.role },
            dashboard: {
                currentAgent: dashboard.currentAgent,
                stats: dashboard.stats,
                recentConversations: dashboard.recentConversations.map(
                    (conversation) => ({
                        id: conversation.id,
                        operationalStatus: conversation.operationalStatus,
                        contact: {
                            customName: conversation.contact.customName,
                            profileName: conversation.contact.profileName,
                            phone: conversation.contact.phone
                        },
                        messages: conversation.messages.map((message) => ({
                            body: message.body,
                            type: message.type
                        }))
                    })
                ),
                recentMessages: dashboard.recentMessages.map((message) => ({
                    direction: message.direction,
                    body: message.body,
                    type: message.type,
                    conversation: {
                        id: message.conversation.id,
                        contact: {
                            customName: message.conversation.contact.customName,
                            profileName: message.conversation.contact.profileName,
                            phone: message.conversation.contact.phone
                        }
                    }
                }))
            },
            unassignedCount
        });
    }

    static async updateStatus(req: Request, res: Response) {
        try {
            const status = req.body.status as UserStatus;

            await AgentService.updateStatus(req.user!.id, status);

            if (req.accepts("json")) {
                return res.json({ ok: true, status });
            }

            return res.redirect("/panel/agent/dashboard?success=status");
        } catch {
            if (req.accepts("json")) {
                return res.status(400).json({ ok: false });
            }

            return res.redirect("/panel/agent/dashboard?error=status");
        }
    }
}
