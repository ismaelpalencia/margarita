import axios from "axios";
import crypto from "node:crypto";

import { LeadStatus, LogLevel, LogModule, Prisma } from "@prisma/client";

import { prisma } from "../config/prisma";
import { LogService } from "./log.service";
import { emailIndex } from "../utils/email";
import { extractEmail } from "../utils/lead";

type CaptureInput = {
    workspaceId: string;
    contactId?: string | null;
    conversationId?: string | null;
    name?: string | null;
    email?: string | null;
    interest?: string | null;
    fields?: Prisma.InputJsonValue | null;
    source: string;
};

function sign(secret: string, body: string): string {
    return "sha256=" + crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

export class LeadService {
    static async list(workspaceId: string, status?: string) {
        return prisma.lead.findMany({
            where: {
                workspaceId,
                ...(status && status !== "ALL" ? { status: status as LeadStatus } : {})
            },
            orderBy: { createdAt: "desc" }
        });
    }

    static async updateStatus(workspaceId: string, leadId: string, status: LeadStatus) {
        await prisma.lead.updateMany({
            where: { id: leadId, workspaceId },
            data: { status }
        });
    }

    /**
     * Captura un lead. Idempotente por conversación + correo (índice ciego):
     * si ya existe, devuelve el existente y no lo duplica. Si el workspace
     * tiene webhook de leads, lo entrega firmado.
     */
    static async capture(input: CaptureInput) {
        const email = input.email?.trim().toLowerCase() || null;
        const emailHash = email ? emailIndex(email) : null;

        const existing = await prisma.lead.findFirst({
            where: {
                workspaceId: input.workspaceId,
                conversationId: input.conversationId ?? null,
                emailHash
            }
        });

        if (existing) {
            /** Un flujo guiado puede enriquecer un lead que ya existía. */
            const lead = await prisma.lead.update({
                where: { id: existing.id },
                data: {
                    ...(input.name ? { name: input.name.trim() } : {}),
                    ...(input.interest
                        ? { interest: input.interest.trim() }
                        : {}),
                    ...(input.fields ? { fields: input.fields } : {})
                }
            });

            return { lead, created: false };
        }

        const lead = await prisma.lead.create({
            data: {
                workspaceId: input.workspaceId,
                contactId: input.contactId ?? null,
                conversationId: input.conversationId ?? null,
                name: input.name?.trim() || null,
                email,
                emailHash,
                interest: input.interest?.trim() || null,
                fields: input.fields ?? undefined,
                source: input.source,
                status: LeadStatus.NUEVO
            }
        });

        await LogService.create({
            workspaceId: input.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.CONTACT,
            action: "LEAD_CREATED",
            message: "Se capturó un lead.",
            payload: {
                leadId: lead.id,
                conversationId: input.conversationId ?? null,
                source: input.source
            }
        }).catch(() => undefined);

        /** El webhook saliente no debe impedir que el lead se guarde. */
        await LeadService.deliverWebhook(input.workspaceId, lead.id).catch(() => undefined);

        return { lead, created: true };
    }

    /**
     * Entrega el lead al webhook saliente, firmado con HMAC-SHA256 y con
     * idempotencia por lead.id. Un fallo se guarda para reintentar a mano.
     */
    static async deliverWebhook(workspaceId: string, leadId: string) {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { leadWebhookUrl: true, leadWebhookSecret: true }
        });

        if (!workspace?.leadWebhookUrl) {
            return;
        }

        const lead = await prisma.lead.findUniqueOrThrow({
            where: { id: leadId }
        });

        const payload = {
            id: lead.id,
            event: "lead.created",
            email: lead.email,
            name: lead.name,
            interest: lead.interest,
            fields: lead.fields,
            source: lead.source,
            status: lead.status,
            createdAt: lead.createdAt.toISOString()
        };
        const body = JSON.stringify(payload);

        const attempts = lead.webhookAttempts + 1;

        try {
            const response = await axios.post(workspace.leadWebhookUrl, body, {
                headers: {
                    "content-type": "application/json",
                    "x-margarita-signature": workspace.leadWebhookSecret
                        ? sign(workspace.leadWebhookSecret, body)
                        : "",
                    "x-idempotency-key": lead.id
                },
                timeout: 15000
            });

            if (response.status >= 200 && response.status < 300) {
                await prisma.lead.update({
                    where: { id: leadId },
                    data: {
                        webhookSentAt: new Date(),
                        webhookFailedAt: null,
                        webhookError: null,
                        webhookAttempts: attempts
                    }
                });

                await LogService.create({
                    workspaceId,
                    level: LogLevel.INFO,
                    module: LogModule.CONTACT,
                    action: "LEAD_WEBHOOK_SENT",
                    message: "Se entregó el lead al webhook saliente.",
                    payload: { leadId }
                }).catch(() => undefined);

                return;
            }

            throw new Error(`El webhook respondió ${response.status}.`);
        } catch (error) {
            const message = axios.isAxiosError(error)
                ? (error.response?.status ? `El webhook respondió ${error.response.status}.` : error.message)
                : error instanceof Error
                  ? error.message
                  : "Error desconocido";

            await prisma.lead.update({
                where: { id: leadId },
                data: {
                    webhookFailedAt: new Date(),
                    webhookError: message.slice(0, 500),
                    webhookAttempts: attempts
                }
            });

            await LogService.create({
                workspaceId,
                level: LogLevel.WARN,
                module: LogModule.CONTACT,
                action: "LEAD_WEBHOOK_FAILED",
                message: "No se pudo entregar el lead al webhook saliente.",
                payload: { leadId, error: message.slice(0, 300) }
            }).catch(() => undefined);

            throw new Error(message);
        }
    }

    static async retry(workspaceId: string, leadId: string) {
        await LeadService.deliverWebhook(workspaceId, leadId);
    }

    static async exportCsv(workspaceId: string): Promise<string> {
        const leads = await LeadService.list(workspaceId);
        const rows = [
            ["id", "email", "nombre", "interes", "origen", "estado", "creado"].join(",")
        ];

        for (const lead of leads) {
            rows.push(
                [
                    lead.id,
                    csvCell(lead.email),
                    csvCell(lead.name),
                    csvCell(lead.interest),
                    csvCell(lead.source),
                    lead.status,
                    lead.createdAt.toISOString()
                ].join(",")
            );
        }

        return "\uFEFF" + rows.join("\r\n");
    }
}

function csvCell(value: string | null): string {
    if (value == null) {
        return "";
    }

    const escaped = value.replace(/"/g, "\"\"");

    return /[,"\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}