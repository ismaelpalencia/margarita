import axios from "axios";
import crypto from "node:crypto";

import { LeadStatus, LogLevel, LogModule, Prisma } from "@prisma/client";

import { prisma } from "../config/prisma";
import { LogService } from "./log.service";
import { emailIndex } from "../utils/email";
import { extractEmail } from "../utils/lead";
import { buildLeadsCsv, LeadCsvColumn } from "../utils/lead-csv";

type CaptureInput = {
    workspaceId: string;
    contactId?: string | null;
    conversationId?: string | null;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    interest?: string | null;
    notes?: string | null;
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

    static async delete(workspaceId: string, leadId: string) {
        const lead = await prisma.lead.findFirst({
            where: { id: leadId, workspaceId },
            select: { id: true, name: true, phone: true }
        });

        if (!lead) {
            throw new Error("Lead no encontrado.");
        }

        await prisma.lead.delete({ where: { id: lead.id } });

        await LogService.create({
            workspaceId,
            level: LogLevel.WARN,
            module: LogModule.CONTACT,
            action: "LEAD_DELETED",
            message: "Se eliminó un lead.",
            payload: { leadId: lead.id }
        }).catch(() => undefined);

        return lead;
    }

    static async deleteAll(workspaceId: string) {
        const result = await prisma.lead.deleteMany({
            where: { workspaceId }
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.WARN,
            module: LogModule.CONTACT,
            action: "LEADS_DELETED_ALL",
            message: "Se eliminaron todos los leads del workspace.",
            payload: { count: result.count }
        }).catch(() => undefined);

        return result.count;
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
                    ...(input.phone ? { phone: input.phone.trim() } : {}),
                    ...(input.interest
                        ? { interest: input.interest.trim() }
                        : {}),
                    ...(input.notes !== undefined
                        ? { notes: input.notes?.trim() || null }
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
                phone: input.phone?.trim() || null,
                email,
                emailHash,
                interest: input.interest?.trim() || null,
                notes: input.notes?.trim() || null,
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
        await LeadService.deliverSheetsWebhook(input.workspaceId, lead.id).catch(
            () => undefined
        );

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
            phone: lead.phone,
            interest: lead.interest,
            notes: lead.notes,
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

    /**
     * Envía el lead a un Web App de Google Apps Script. Es independiente del
     * webhook CRM: si uno falla, el otro sigue. No bloquea el guardado.
     */
    static async deliverSheetsWebhook(workspaceId: string, leadId: string) {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: {
                leadSheetsWebhookUrl: true,
                leadSheetsWebhookSecret: true
            }
        });

        if (!workspace?.leadSheetsWebhookUrl) {
            return;
        }

        const lead = await prisma.lead.findUniqueOrThrow({
            where: { id: leadId }
        });

        const body = JSON.stringify({
            secret: workspace.leadSheetsWebhookSecret || "",
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
            interest: lead.interest,
            source: lead.source,
            status: lead.status,
            createdAt: lead.createdAt.toISOString()
        });

        try {
            const response = await axios.post(
                workspace.leadSheetsWebhookUrl,
                body,
                {
                    headers: { "content-type": "application/json" },
                    timeout: 15000
                }
            );

            if (response.status < 200 || response.status >= 300) {
                throw new Error(`Apps Script respondió ${response.status}.`);
            }

            const result = response.data;
            if (
                result &&
                typeof result === "object" &&
                "ok" in result &&
                result.ok !== true
            ) {
                throw new Error(
                    result.error === "secret"
                        ? "Apps Script rechazó el secreto de la hoja."
                        : "Apps Script no confirmó la fila."
                );
            }

            await LogService.create({
                workspaceId,
                level: LogLevel.INFO,
                module: LogModule.CONTACT,
                action: "LEAD_SHEETS_SENT",
                message: "Se agregó el lead a Google Sheets.",
                payload: { leadId }
            }).catch(() => undefined);
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "Error desconocido";

            await LogService.create({
                workspaceId,
                level: LogLevel.WARN,
                module: LogModule.CONTACT,
                action: "LEAD_SHEETS_FAILED",
                message: "No se pudo agregar el lead a Google Sheets.",
                payload: { leadId, error: message.slice(0, 300) }
            }).catch(() => undefined);

            throw new Error(message);
        }
    }

    static async retry(workspaceId: string, leadId: string) {
        await LeadService.deliverWebhook(workspaceId, leadId);
    }

    static async exportCsv(
        workspaceId: string,
        options: { columns?: LeadCsvColumn[]; includeFields?: boolean } = {}
    ): Promise<string> {
        const leads = await LeadService.list(workspaceId);

        return buildLeadsCsv(leads, options);
    }
}

