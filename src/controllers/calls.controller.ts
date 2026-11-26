import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { CallDirection, Call as CallRow, UserRole, UserStatus } from "@prisma/client";
import { Request, Response } from "express";
import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { decryptSecret } from "../utils/crypto";
import { contactPhoneFields, normalizePhone } from "../utils/phone";
import { MessageService } from "../services/message.service";
import { PushService } from "../services/push.service";
import { logger } from "../config/logger";

const activeStatuses = ["RINGING", "CONNECTING", "ACTIVE"];
const finalStatuses = new Set(["COMPLETED", "MISSED", "REJECTED", "FAILED"]);

type InternalContextRequest = {
    purpose?: "conversation" | "incoming" | "presence";
    userId?: string;
    workspaceId?: string;
    role?: string;
    conversationId?: string;
    phoneNumberId?: string;
    phone?: string;
    callId?: string;
};

function sameSecret(expected: string, received: string | undefined): boolean {
    if (!expected || !received) return false;
    const left = Buffer.from(expected);
    const right = Buffer.from(received);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function internalAuth(req: Request, res: Response): boolean {
    const authorization = req.get("authorization") || "";
    const secret = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (sameSecret(appConfig.calls.internalSecret, secret)) return true;
    res.status(401).json({ error: "No autorizado." });
    return false;
}

function canReadCall(req: Request, call: Pick<CallRow, "workspaceId" | "conversationId"> & { conversation?: { assignedUserId: string | null } }): boolean {
    if (!req.user || call.workspaceId !== req.user.workspaceId) return false;
    if (req.user.role === UserRole.ADMIN) return true;
    return call.conversation?.assignedUserId === req.user.id;
}

function publicCall(call: CallRow) {
    return {
        id: call.id,
        conversationId: call.conversationId,
        agentId: call.agentId,
        direction: call.direction,
        status: call.status,
        startedAt: call.startedAt,
        acceptedAt: call.acceptedAt,
        endedAt: call.endedAt,
        durationSeconds: call.durationSeconds,
        error: call.error
    };
}

export class CallsController {
    static async token(req: Request, res: Response) {
        if (!appConfig.calls.enabled || !appConfig.calls.jwtSecret || appConfig.calls.jwtSecret.length < 32 || !appConfig.calls.publicOrigin) {
            return res.status(503).json({ canCall: false, error: "Las llamadas no están configuradas." });
        }
        const conversationId = typeof req.query.conversationId === "string" ? req.query.conversationId : "";
        const baseClaims = { userId: req.user!.id, workspaceId: req.user!.workspaceId, role: req.user!.role };
        if (conversationId) {
            const context = await CallsController.getAgentContext({ ...baseClaims, conversationId });
            const token = jwt.sign({ ...baseClaims, conversationId, scope: "conversation" }, appConfig.calls.jwtSecret, { algorithm: "HS256", expiresIn: 300, issuer: "margarita" });
            return res.json({ token, canCall: context.canCall, serviceUrl: appConfig.calls.publicOrigin, reason: context.reason || null });
        }
        const presence = await CallsController.getPresenceContext(baseClaims);
        if (!presence.canReceiveCalls) return res.status(403).json({ canCall: false, error: presence.reason });
        const token = jwt.sign({ ...baseClaims, scope: "presence" }, appConfig.calls.jwtSecret, { algorithm: "HS256", expiresIn: 300, issuer: "margarita" });
        return res.json({ token, canCall: true, serviceUrl: appConfig.calls.publicOrigin });
    }

    static async eligibility(req: Request, res: Response) {
        const conversationId = typeof req.params.conversationId === "string" ? req.params.conversationId : "";
        const context = await CallsController.getAgentContext({ userId: req.user!.id, workspaceId: req.user!.workspaceId, role: req.user!.role, conversationId });
        return res.json({ canCall: context.canCall, reason: context.reason || null });
    }

    static async history(req: Request, res: Response) {
        const conversationId = req.params.conversationId;
        const conversation = await prisma.conversation.findFirst({
            where: { id: conversationId, workspaceId: req.user!.workspaceId, ...(req.user!.role === UserRole.AGENT ? { assignedUserId: req.user!.id } : {}) },
            select: { id: true }
        });
        if (!conversation) return res.sendStatus(404);
        const calls = await prisma.call.findMany({ where: { workspaceId: req.user!.workspaceId, conversationId }, orderBy: { startedAt: "desc" }, take: 100 });
        return res.json({ calls: calls.map(publicCall) });
    }

    static async detail(req: Request, res: Response) {
        const call = await prisma.call.findFirst({
            where: { id: req.params.id, workspaceId: req.user!.workspaceId },
            include: { conversation: { select: { assignedUserId: true } } }
        });
        if (!call || !canReadCall(req, call)) return res.sendStatus(404);
        return res.json({ call: publicCall(call) });
    }

    static async active(req: Request, res: Response) {
        const call = await prisma.call.findFirst({ where: { workspaceId: req.user!.workspaceId, agentId: req.user!.id, status: { in: activeStatuses } }, orderBy: { startedAt: "desc" } });
        return res.json({ call: call ? publicCall(call) : null });
    }

    static async context(req: Request, res: Response) {
        if (!internalAuth(req, res)) return;
        const body = req.body as InternalContextRequest;
        try {
            if (body.purpose === "conversation" && body.userId && body.workspaceId && body.conversationId) {
                return res.json({ context: await CallsController.getAgentContext({ userId: body.userId, workspaceId: body.workspaceId, role: body.role || "AGENT", conversationId: body.conversationId }) });
            }
            if (body.purpose === "presence" && body.userId && body.workspaceId) {
                return res.json({ context: await CallsController.getPresenceContext({ userId: body.userId, workspaceId: body.workspaceId, role: body.role || "AGENT" }) });
            }
            if (body.purpose === "incoming" && body.phoneNumberId && body.phone) {
                return res.json({ context: await CallsController.getIncomingContext(body.phoneNumberId, body.phone, body.callId) });
            }
            return res.status(400).json({ error: "Solicitud de contexto inválida." });
        } catch {
            return res.status(400).json({ error: "No se pudo resolver el contexto de llamada." });
        }
    }

    static async events(req: Request, res: Response) {
        if (!internalAuth(req, res)) return;
        const body = req.body as Record<string, unknown>;
        const metaCallId = typeof body.metaCallId === "string" ? body.metaCallId.slice(0, 180) : "";
        const direction = body.direction === "OUTBOUND" ? CallDirection.OUTBOUND : body.direction === "INBOUND" ? CallDirection.INBOUND : null;
        const status = typeof body.status === "string" ? body.status : "";
        const allowedStatuses = new Set(["RINGING", "CONNECTING", "ACTIVE", "COMPLETED", "MISSED", "REJECTED", "FAILED"]);
        const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
        const conversationId = typeof body.conversationId === "string" ? body.conversationId : "";
        const localCallId = typeof body.localCallId === "string" ? body.localCallId.slice(0, 180) : "";
        const agentId = typeof body.agentId === "string" ? body.agentId : null;
        const recipientUserIds = Array.isArray(body.recipientUserIds) ? body.recipientUserIds.filter((id): id is string => typeof id === "string").slice(0, 50) : [];
        const pushUserIds = Array.isArray(body.pushUserIds) ? body.pushUserIds.filter((id): id is string => typeof id === "string" && recipientUserIds.includes(id)).slice(0, 50) : [];
        const closePushUserIds = Array.isArray(body.closePushUserIds) ? body.closePushUserIds.filter((id): id is string => typeof id === "string" && recipientUserIds.includes(id)).slice(0, 50) : [];
        if (!metaCallId || !direction || !allowedStatuses.has(status) || !workspaceId || !conversationId) return res.status(400).json({ error: "Evento de llamada inválido." });
        const acceptedAt = body.accepted === true || status === "ACTIVE" ? new Date() : null;
        const endedAt = finalStatuses.has(status) ? new Date() : null;
        const durationSeconds = Number.isInteger(body.durationSeconds) ? Math.min(86400, Math.max(0, Number(body.durationSeconds))) : null;
        const error = typeof body.error === "string" ? body.error.slice(0, 240) : null;
        try {
            const previous = await prisma.call.findUnique({ where: { metaCallId } })
                || (localCallId && localCallId !== metaCallId ? await prisma.call.findUnique({ where: { metaCallId: localCallId } }) : null);
            if (previous && (previous.workspaceId !== workspaceId || previous.conversationId !== conversationId)) {
                return res.status(409).json({ error: "El evento no corresponde a la llamada registrada." });
            }
            if (previous && finalStatuses.has(previous.status) && !finalStatuses.has(status)) {
                return res.status(202).json({ accepted: true, id: previous.id });
            }
            const createData = { metaCallId, workspaceId, conversationId, agentId, direction, status, ...(acceptedAt ? { acceptedAt } : {}), ...(endedAt ? { endedAt } : {}), ...(durationSeconds !== null ? { durationSeconds } : {}), ...(error ? { error } : {}) };
            const updateData = { metaCallId, status, ...(agentId ? { agentId } : {}), ...(acceptedAt && !previous?.acceptedAt ? { acceptedAt } : {}), ...(endedAt && !previous?.endedAt ? { endedAt } : {}), ...(durationSeconds !== null ? { durationSeconds } : {}), ...(error ? { error } : {}) };
            const call = previous
                ? await prisma.call.update({ where: { id: previous.id }, data: updateData })
                : await prisma.call.upsert({ where: { metaCallId }, create: createData, update: updateData });
            if (status === "RINGING" && pushUserIds.length) {
                void PushService.notifyIncomingCall({ workspaceId, conversationId, callId: localCallId || metaCallId, recipientUserIds: pushUserIds })
                    .catch((pushError) => logger.warn({ error: pushError }, "No se pudo enviar el aviso push de llamada entrante"));
            } else if (status !== "RINGING" && recipientUserIds.length) {
                void PushService.closeIncomingCallNotification({ workspaceId, conversationId, callId: localCallId || metaCallId, recipientUserIds })
                    .catch((pushError) => logger.warn({ error: pushError }, "No se pudo cerrar el aviso push de llamada"));
            }
            if (closePushUserIds.length) {
                void PushService.closeIncomingCallNotification({ workspaceId, conversationId, callId: localCallId || metaCallId, recipientUserIds: closePushUserIds })
                    .catch((pushError) => logger.warn({ error: pushError }, "No se pudo cerrar el aviso push de llamada asignada"));
            }
            if (finalStatuses.has(status) && (!previous || !finalStatuses.has(previous.status))) {
                const note = callEventNote(direction, status, durationSeconds);
                if (note) await MessageService.createCallEventNote({ workspaceId, conversationId, body: note });
            }
            return res.status(202).json({ accepted: true, id: call.id });
        } catch {
            return res.status(409).json({ error: "No se pudo registrar el evento de llamada." });
        }
    }

    private static async getAgentContext(input: { userId: string; workspaceId: string; role: string; conversationId: string }) {
        const user = await prisma.user.findFirst({ where: { id: input.userId, workspaceId: input.workspaceId, isActive: true }, select: { id: true, role: true, status: true, allowedNumberIds: true, workspace: { select: { status: true } } } });
        const conversation = await prisma.conversation.findFirst({
            where: { id: input.conversationId, workspaceId: input.workspaceId },
            include: { contact: true, whatsappNumber: { include: { whatsappAccount: true } } }
        });
        const number = conversation?.whatsappNumber;
        const isAdmin = user?.role === UserRole.ADMIN && input.role === UserRole.ADMIN;
        const assigned = conversation?.assignedUserId === user?.id;
        const availableAgent = user?.role === UserRole.AGENT && input.role === UserRole.AGENT && user.status === UserStatus.AVAILABLE;
        const canAccessNumber = Boolean(user && number && (!user.allowedNumberIds.length || user.allowedNumberIds.includes(number.id)));
        const canCall = Boolean(
            appConfig.calls.enabled && user && user.workspace.status === "ACTIVE" && (isAdmin || availableAgent) &&
            conversation && conversation.status === "OPEN" && !conversation.archivedAt && (isAdmin || (conversation.assignedUserId && assigned)) &&
            conversation.contact.isActive && !conversation.contact.optOutAt && number?.isActive &&
            canAccessNumber
        );
        const reason = !appConfig.calls.enabled ? "Las llamadas están desactivadas." : !user || (user.role !== UserRole.AGENT && user.role !== UserRole.ADMIN) || input.role !== user.role ? "Tu usuario no tiene permiso para llamar." : !conversation ? "No se encontró la conversación." : !isAdmin && !assigned ? "La conversación no está asignada a tu usuario." : !conversation.contact.isActive || conversation.contact.optOutAt ? "El contacto no está disponible para llamadas." : availableAgent === false && user.role === UserRole.AGENT ? "Cambia tu estado a Disponible para llamar." : !number?.isActive ? "El número de WhatsApp está inactivo." : !canAccessNumber ? "No tienes acceso al número de esta conversación." : !canCall ? "No se puede llamar desde esta conversación." : undefined;
        return {
            workspaceId: input.workspaceId, conversationId: input.conversationId,
            contactId: conversation?.contactId || "", phone: conversation?.contact.phone || "",
            agentId: user?.id || input.userId, phoneNumberId: number?.phoneNumberId || "",
            apiVersion: number?.whatsappAccount.apiVersion || "v23.0",
            metaAccessToken: number?.whatsappAccount.accessToken ? decryptSecret(number.whatsappAccount.accessToken) : "",
            canCall: Boolean(canCall), reason
        };
    }

    private static async getIncomingContext(phoneNumberId: string, rawPhone: string, callId?: string) {
        const number = await prisma.whatsAppNumber.findUnique({ where: { phoneNumberId }, include: { whatsappAccount: { include: { workspace: { select: { status: true } } } } } });
        if (!number) return null;
        const phone = normalizePhone(rawPhone);
        const hash = contactPhoneFields(phone).phoneHash;
        const contact = await prisma.contact.findFirst({ where: { workspaceId: number.whatsappAccount.workspaceId, phoneHash: hash } });
        const conversation = contact ? await prisma.conversation.findFirst({
            where: { workspaceId: number.whatsappAccount.workspaceId, whatsappNumberId: number.id, contactId: contact.id, status: "OPEN", archivedAt: null },
            include: { contact: true, assignedUser: { select: { id: true, role: true, status: true, isActive: true, allowedNumberIds: true } } }
        }) : null;
        const agent = conversation?.assignedUser;
        const assignedAgentCanCall = Boolean(agent?.isActive && agent.status === UserStatus.AVAILABLE && agent.role === UserRole.AGENT && (!agent.allowedNumberIds.length || agent.allowedNumberIds.includes(number.id)));
        const admins = conversation ? await prisma.user.findMany({
            where: { workspaceId: number.whatsappAccount.workspaceId, role: UserRole.ADMIN, isActive: true, workspace: { status: "ACTIVE" } },
            select: { id: true, allowedNumberIds: true }
        }) : [];
        const eligibleRecipientIds = [
            ...(assignedAgentCanCall && agent ? [agent.id] : []),
            ...admins.filter((admin) => admin.allowedNumberIds.length === 0 || admin.allowedNumberIds.includes(number.id)).map((admin) => admin.id)
        ];
        const canCall = Boolean(appConfig.calls.enabled && number.isActive && number.whatsappAccount.workspace.status === "ACTIVE" && contact?.isActive && !contact?.optOutAt && conversation && eligibleRecipientIds.length);
        return {
            workspaceId: number.whatsappAccount.workspaceId,
            conversationId: conversation?.id || "",
            contactId: contact?.id || "",
            phone: contact?.phone || phone,
            agentId: agent?.id || "",
            phoneNumberId: number.phoneNumberId,
            apiVersion: number.whatsappAccount.apiVersion,
            metaAccessToken: decryptSecret(number.whatsappAccount.accessToken),
            canCall,
            assignedAgentCanCall,
            eligibleRecipientIds,
            callId
        };
    }

    private static async getPresenceContext(input: { userId: string; workspaceId: string; role: string }) {
        const user = await prisma.user.findFirst({
            where: { id: input.userId, workspaceId: input.workspaceId, isActive: true, role: { in: [UserRole.AGENT, UserRole.ADMIN] } },
            select: { id: true, role: true, workspace: { select: { status: true } } }
        });
        const canReceiveCalls = Boolean(appConfig.calls.enabled && user && user.role === input.role && user.workspace.status === "ACTIVE");
        return {
            canReceiveCalls,
            reason: !appConfig.calls.enabled ? "Las llamadas están desactivadas." : !user ? "Tu usuario ya no tiene acceso al panel." : user.workspace.status !== "ACTIVE" ? "El espacio de trabajo está suspendido." : undefined
        };
    }
}

function callEventNote(direction: CallDirection, status: string, durationSeconds: number | null): string | null {
    if (status === "MISSED") return direction === CallDirection.INBOUND ? "Llamada entrante perdida. No se pudo contestar." : "Llamada saliente perdida.";
    if (status === "REJECTED") return direction === CallDirection.INBOUND ? "Llamada entrante rechazada." : "Llamada saliente rechazada.";
    if (status === "FAILED") return direction === CallDirection.INBOUND ? "No se pudo completar la llamada entrante." : "No se pudo completar la llamada saliente.";
    if (status === "COMPLETED") {
        const duration = durationSeconds === null ? "" : ` · duración ${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, "0")}`;
        return `${direction === CallDirection.INBOUND ? "Llamada entrante" : "Llamada saliente"} finalizada${duration}.`;
    }
    return null;
}
