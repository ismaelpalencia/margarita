import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { ConversationService } from "../services/conversation.service";
import { WhatsAppCloudOperationsService } from "../services/whatsapp-cloud-operations.service";
import { getRequiredParam } from "../utils/request";
import { deleteStoredMedia } from "../services/media-storage.service";

async function authorizedConversation(req: Request) {
    const id = getRequiredParam(req, "id");
    return req.user!.role === "AGENT"
        ? ConversationService.getConversationForAgent(req.user!.workspaceId, req.user!.id, id)
        : ConversationService.getConversationForAdmin(req.user!.workspaceId, id);
}

export class WhatsAppCloudOperationsController {
    static async blockUsers(req: Request, res: Response) {
        try {
            const method = req.method === "GET" ? "GET" : req.method === "DELETE" ? "DELETE" : "POST";
            const raw = req.body?.users;
            const users = method === "GET" ? [] : Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,]+/) : [];
            if (method !== "GET" && (!users.length || users.length > 100 || users.some((user) => typeof user !== "string" || !/^\+?\d{7,15}$/.test(user)))) return res.status(400).json({ error: "invalid_users" });
            return res.json(await WhatsAppCloudOperationsService.blockUsers(req.user!.workspaceId, getRequiredParam(req, "numberId"), method, users.map((user) => String(user).replace(/^\+/, ""))));
        } catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : "meta_error" }); }
    }

    static async react(req: Request, res: Response) {
        try {
            const conversation = await authorizedConversation(req);
            const messageId = String(req.body?.messageId || "");
            const emoji = String(req.body?.emoji ?? "");
            if (!messageId || emoji.length > 16) return res.status(400).json({ error: "invalid_request" });
            const message = await prisma.message.findFirst({ where: { wamid: messageId, conversationId: conversation.id, workspaceId: req.user!.workspaceId, deletedAt: null } });
            if (!message) return res.status(404).json({ error: "message_not_found" });
            await WhatsAppCloudOperationsService.react(req.user!.workspaceId, conversation.whatsappNumberId, conversation.contact.phone, messageId, emoji);
            return res.json({ ok: true });
        } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "request_failed" }); }
    }

    static async typing(req: Request, res: Response) {
        try {
            const conversation = await authorizedConversation(req);
            const incoming = await prisma.message.findFirst({ where: { conversationId: conversation.id, workspaceId: req.user!.workspaceId, direction: "IN", wamid: { not: null }, deletedAt: null }, orderBy: { createdAt: "desc" }, select: { wamid: true } });
            if (incoming?.wamid) await WhatsAppCloudOperationsService.sendTyping(req.user!.workspaceId, conversation.whatsappNumberId, incoming.wamid);
            return res.json({ ok: true });
        } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "request_failed" }); }
    }

    static async setConversationBlocked(req: Request, res: Response) {
        try {
            const conversation = await authorizedConversation(req);
            if (typeof req.body?.blocked !== "boolean") return res.status(400).json({ error: "invalid_request" });
            const phone = conversation.contact.phone.replace(/^\+/, "");
            if (!/^\d{7,15}$/.test(phone)) return res.status(400).json({ error: "invalid_phone" });
            const result = await WhatsAppCloudOperationsService.blockUsers(
                req.user!.workspaceId,
                conversation.whatsappNumberId,
                req.body.blocked ? "POST" : "DELETE",
                [phone]
            );
            return res.json({ ok: true, blocked: req.body.blocked, result });
        } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : "request_failed" }); }
    }

    static async health(req: Request, res: Response) {
        try { return res.json(await WhatsAppCloudOperationsService.health(req.user!.workspaceId, getRequiredParam(req, "numberId"))); }
        catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : "meta_error" }); }
    }

    static async profile(req: Request, res: Response) {
        const numberId = getRequiredParam(req, "numberId");
        try {
            if (req.method === "GET") return res.json(await WhatsAppCloudOperationsService.getProfile(req.user!.workspaceId, numberId));
            const fields = ["about", "address", "description", "email", "profile_picture_url", "websites", "vertical"] as const;
            const profile: Record<string, unknown> = {};
            for (const field of fields) {
                const value = req.body?.[field];
                if (value === undefined) continue;
                if (field === "websites") profile[field] = Array.isArray(value) ? value : String(value).split(/\r?\n/).map((item: string) => item.trim()).filter(Boolean);
                else if (typeof value === "string" && value.length <= 1024) profile[field] = value;
                else return res.status(400).json({ error: "invalid_profile" });
            }
            const result = await WhatsAppCloudOperationsService.updateProfile(req.user!.workspaceId, numberId, profile);
            if (req.accepts("html") && !req.accepts("json")) return res.redirect("/panel/admin/whatsapp?success=profile_updated");
            return res.json(result);
        } catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : "meta_error" }); }
    }

    static async deleteMedia(req: Request, res: Response) {
        try {
            const mediaId = getRequiredParam(req, "mediaId");
            const owned = await prisma.message.findMany({ where: { workspaceId: req.user!.workspaceId, mediaId }, select: { id: true, mediaPath: true } });
            if (!owned.length) return res.status(404).json({ error: "media_not_found" });
            const result = await WhatsAppCloudOperationsService.deleteRemoteMedia(req.user!.workspaceId, mediaId);
            await Promise.all(owned.map(async (message) => {
                if (message.mediaPath) await deleteStoredMedia(message.mediaPath).catch(() => undefined);
                await prisma.message.update({ where: { id: message.id }, data: { mediaPath: null, mediaSize: null, mediaDownloadedAt: null, mediaDownloadError: "Archivo eliminado de Meta por un administrador." } });
            }));
            return res.json(result);
        } catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : "meta_error" }); }
    }
}
