import { Request, Response } from "express";
import axios from "axios";
import { prisma } from "../config/prisma";
import { ConversationService } from "../services/conversation.service";
import { WhatsAppCloudOperationsService } from "../services/whatsapp-cloud-operations.service";
import { getRequiredParam } from "../utils/request";
import { deleteStoredMedia } from "../services/media-storage.service";
import { describeMetaError } from "../utils/meta-error";
import { blindIndex } from "../utils/crypto";

function operationErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error) && error.response?.data) {
        return describeMetaError({ data: error.response.data, status: error.response.status }) || error.message;
    }
    return error instanceof Error ? error.message : "request_failed";
}

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
            const numberId = getRequiredParam(req, "numberId");
            const normalizedUsers = users.map((user) => String(user).replace(/^\+/, ""));
            const result = await WhatsAppCloudOperationsService.blockUsers(req.user!.workspaceId, numberId, method, normalizedUsers);
            if (method !== "GET") await WhatsAppCloudOperationsController.syncLocalBlockState(req.user!.workspaceId, numberId, normalizedUsers, method === "POST");
            return res.json(result);
        } catch (error) { return res.status(502).json({ error: operationErrorMessage(error) }); }
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
            await prisma.conversation.update({
                where: { id: conversation.id },
                data: { whatsappBlockedAt: req.body.blocked ? new Date() : null }
            });
            return res.json({ ok: true, blocked: req.body.blocked, result });
        } catch (error) { return res.status(502).json({ error: operationErrorMessage(error) }); }
    }

    private static async syncLocalBlockState(workspaceId: string, numberId: string, phones: string[], blocked: boolean) {
        const contacts = await prisma.contact.findMany({
            where: { workspaceId, phoneHash: { in: phones.map(blindIndex) } },
            select: { id: true }
        });
        if (!contacts.length) return;
        await prisma.conversation.updateMany({
            where: { workspaceId, whatsappNumberId: numberId, contactId: { in: contacts.map(({ id }) => id) } },
            data: { whatsappBlockedAt: blocked ? new Date() : null }
        });
    }

    static async health(req: Request, res: Response) {
        try { return res.json(await WhatsAppCloudOperationsService.health(req.user!.workspaceId, getRequiredParam(req, "numberId"))); }
        catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : "meta_error" }); }
    }

    static async accountHealth(req: Request, res: Response) {
        try { return res.json(await WhatsAppCloudOperationsService.accountHealth(req.user!.workspaceId)); }
        catch (error) { return res.status(502).json({ error: operationErrorMessage(error) }); }
    }

    static async accountAnalytics(req: Request, res: Response) {
        const now = Math.floor(Date.now() / 1000);
        const start = req.query.start === undefined ? now - 30 * 86400 : Number(req.query.start);
        const end = req.query.end === undefined ? now : Number(req.query.end);
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start || end > now + 3600 || end - start > 366 * 86400) {
            return res.status(400).json({ error: "El rango de analítica debe ser válido y no exceder 366 días." });
        }
        try { return res.json(await WhatsAppCloudOperationsService.accountAnalytics(req.user!.workspaceId, start, end)); }
        catch (error) { return res.status(502).json({ error: operationErrorMessage(error) }); }
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
