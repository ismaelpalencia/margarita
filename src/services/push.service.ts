import webpush from "web-push";
import { UserRole } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { logger } from "../config/logger";

const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || "";
const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:admin@margaritaapp.org";

let configured = false;

if (publicKey && privateKey) {
    try {
        webpush.setVapidDetails(subject, publicKey, privateKey);
        configured = true;
    } catch (error) {
        logger.error({ error }, "No se pudo configurar Web Push");
    }
}

type NotificationPayload = {
    title: string;
    body: string;
    url: string;
    conversationId: string;
    tag?: string;
    kind?: "call" | "call-ended";
    callId?: string;
    ttl?: number;
};

function absoluteUrl(path: string): string {
    try {
        return new URL(path, appConfig.appUrl).toString();
    } catch {
        return path;
    }
}

export class PushService {
    static isConfigured() {
        return configured;
    }

    static getPublicKey() {
        return publicKey;
    }

    static async subscribe(params: {
        userId: string;
        workspaceId: string;
        endpoint: string;
        p256dh: string;
        auth: string;
        userAgent?: string | null;
    }) {
        if (!params.endpoint.startsWith("https://")) {
            throw new Error("Endpoint de notificaciones inválido.");
        }

        await prisma.pushSubscription.upsert({
            where: { endpoint: params.endpoint },
            update: {
                userId: params.userId,
                workspaceId: params.workspaceId,
                p256dh: params.p256dh,
                auth: params.auth,
                userAgent: params.userAgent?.slice(0, 500) || null
            },
            create: {
                userId: params.userId,
                workspaceId: params.workspaceId,
                endpoint: params.endpoint,
                p256dh: params.p256dh,
                auth: params.auth,
                userAgent: params.userAgent?.slice(0, 500) || null
            }
        });
    }

    static async unsubscribe(userId: string, endpoint: string) {
        await prisma.pushSubscription.deleteMany({
            where: { userId, endpoint }
        });
    }

    private static async send(
        subscriptions: Array<{
            id: string;
            endpoint: string;
            p256dh: string;
            auth: string;
        }>,
        payload: NotificationPayload
    ) {
        if (!configured) return 0;

        let sent = 0;

        await Promise.allSettled(
            subscriptions.map(async (subscription) => {
                try {
                    await webpush.sendNotification(
                        {
                            endpoint: subscription.endpoint,
                            keys: {
                                p256dh: subscription.p256dh,
                                auth: subscription.auth
                            }
                        },
                        JSON.stringify(payload),
                        {
                            TTL: payload.ttl ?? 60 * 60,
                            urgency: "high"
                        }
                    );
                    sent += 1;
                    await prisma.pushSubscription.update({
                        where: { id: subscription.id },
                        data: { lastUsedAt: new Date() }
                    });
                } catch (error) {
                    const statusCode =
                        error && typeof error === "object" && "statusCode" in error
                            ? Number(error.statusCode)
                            : 0;

                    if (statusCode === 404 || statusCode === 410) {
                        await prisma.pushSubscription
                            .delete({ where: { id: subscription.id } })
                            .catch(() => undefined);
                    } else {
                        logger.warn(
                            { error, subscriptionId: subscription.id },
                            "Falló una notificación push"
                        );
                    }
                }
            })
        );

        return sent;
    }

    static async notifyIncomingMessage(params: {
        workspaceId: string;
        whatsappNumberId: string;
        conversationId: string;
        contactName: string;
        body: string;
        assignedUserId: string | null;
    }) {
        if (!configured) return 0;

        const number = await prisma.whatsAppNumber.findFirst({
            where: { id: params.whatsappNumberId, whatsappAccount: { workspaceId: params.workspaceId } },
            select: { displayName: true, phoneNumber: true }
        });
        const numberLabel = number?.displayName || number?.phoneNumber || "Número de WhatsApp";

        const recipients = await prisma.user.findMany({
            where: {
                workspaceId: params.workspaceId,
                isActive: true,
                OR: [
                    { role: UserRole.ADMIN },
                    ...(params.assignedUserId
                        ? [{ id: params.assignedUserId, role: UserRole.AGENT }]
                        : [])
                ]
            },
            select: { id: true, role: true, allowedNumberIds: true }
        });

        const allowed = recipients.filter(
            (user) =>
                user.role === UserRole.ADMIN ||
                user.allowedNumberIds.length === 0 ||
                user.allowedNumberIds.includes(params.whatsappNumberId)
        );

        if (allowed.length === 0) return 0;

        const subscriptions = await prisma.pushSubscription.findMany({
            where: {
                workspaceId: params.workspaceId,
                userId: { in: allowed.map((user) => user.id) }
            },
            select: {
                id: true,
                endpoint: true,
                p256dh: true,
                auth: true,
                userId: true
            }
        });

        if (subscriptions.length === 0) return 0;

        const body = `${numberLabel} · ${params.body || "Nuevo mensaje"}`.slice(0, 140);

        let sent = 0;

        for (const user of allowed) {
            const userSubscriptions = subscriptions.filter(
                (subscription) => subscription.userId === user.id
            );

            if (userSubscriptions.length === 0) continue;

            const url =
                user.role === UserRole.ADMIN
                    ? `/panel/admin/conversations/${params.conversationId}`
                    : `/panel/agent/conversations/${params.conversationId}`;

            sent += await this.send(userSubscriptions, {
                title: params.contactName || "Nuevo mensaje",
                body,
                url: absoluteUrl(url),
                conversationId: params.conversationId,
                tag: `marga-conversation-${params.conversationId}`
            });
        }

        return sent;
    }

    static async notifyIncomingCall(params: {
        workspaceId: string;
        conversationId: string;
        callId: string;
        recipientUserIds: string[];
    }) {
        if (!configured || !params.recipientUserIds.length) return 0;
        const [conversation, recipients] = await Promise.all([
            prisma.conversation.findFirst({
                where: { id: params.conversationId, workspaceId: params.workspaceId },
                select: { contact: { select: { customName: true, profileName: true, phone: true } } }
            }),
            prisma.user.findMany({
                where: { id: { in: params.recipientUserIds }, workspaceId: params.workspaceId, isActive: true, role: { in: [UserRole.ADMIN, UserRole.AGENT] } },
                select: { id: true, role: true }
            })
        ]);
        if (!conversation || !recipients.length) return 0;
        const subscriptions = await prisma.pushSubscription.findMany({
            where: { workspaceId: params.workspaceId, userId: { in: recipients.map((user) => user.id) } },
            select: { id: true, endpoint: true, p256dh: true, auth: true, userId: true }
        });
        const name = conversation.contact.customName || conversation.contact.profileName || conversation.contact.phone;
        let sent = 0;
        for (const user of recipients) {
            const userSubscriptions = subscriptions.filter((subscription) => subscription.userId === user.id);
            if (!userSubscriptions.length) continue;
            const url = user.role === UserRole.ADMIN
                ? `/panel/admin/conversations/${params.conversationId}`
                : `/panel/agent/conversations/${params.conversationId}`;
            sent += await this.send(userSubscriptions, {
                title: "Llamada entrante",
                body: `${name} te está llamando. Toca para abrir Margarita.`,
                url: absoluteUrl(url),
                conversationId: params.conversationId,
                tag: `marga-call-${params.callId}`,
                kind: "call",
                callId: params.callId,
                ttl: 30
            });
        }
        return sent;
    }

    static async closeIncomingCallNotification(params: {
        workspaceId: string;
        conversationId: string;
        callId: string;
        recipientUserIds: string[];
    }) {
        if (!configured || !params.recipientUserIds.length) return 0;
        const users = await prisma.user.findMany({
            where: { id: { in: params.recipientUserIds }, workspaceId: params.workspaceId, isActive: true, role: { in: [UserRole.ADMIN, UserRole.AGENT] } },
            select: { id: true, role: true }
        });
        const subscriptions = await prisma.pushSubscription.findMany({
            where: { workspaceId: params.workspaceId, userId: { in: users.map((user) => user.id) } },
            select: { id: true, endpoint: true, p256dh: true, auth: true, userId: true }
        });
        let sent = 0;
        for (const user of users) {
            const userSubscriptions = subscriptions.filter((subscription) => subscription.userId === user.id);
            if (!userSubscriptions.length) continue;
            const url = user.role === UserRole.ADMIN
                ? `/panel/admin/conversations/${params.conversationId}`
                : `/panel/agent/conversations/${params.conversationId}`;
            sent += await this.send(userSubscriptions, {
                title: "Llamada actualizada",
                body: "La llamada entrante ya no está disponible.",
                url: absoluteUrl(url),
                conversationId: params.conversationId,
                tag: `marga-call-${params.callId}`,
                kind: "call-ended",
                callId: params.callId,
                ttl: 30
            });
        }
        return sent;
    }

    static async sendTest(userId: string) {
        const subscriptions = await prisma.pushSubscription.findMany({
            where: { userId },
            select: { id: true, endpoint: true, p256dh: true, auth: true }
        });

        return this.send(subscriptions, {
            title: "Margarita",
            body: "Las notificaciones están funcionando.",
            url: absoluteUrl("/account/notifications"),
            conversationId: "",
            tag: "marga-test"
        });
    }
}
