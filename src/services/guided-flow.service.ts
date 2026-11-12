import { LogLevel, LogModule, Prisma } from "@prisma/client";

import { prisma } from "../config/prisma";
import { MessageService } from "./message.service";
import { LogService } from "./log.service";
import { AiAutoReplyService } from "./ai/auto-reply.service";
import { LeadService } from "./lead.service";
import {
    findStep,
    guidedStepsSchema,
    guidedTriggerMatches,
    GuidedStep
} from "../utils/guided-flow";

const MAX_CHAIN = 10;

export class GuidedFlowService {
    /**
     * Atiende un mensaje entrante. Devuelve true si el flujo guiado lo
     * consumió; en ese caso no debe correr la IA ni los flujos de una sola
     * respuesta.
     */
    static async handleIncoming(params: {
        workspaceId: string;
        conversationId: string;
        text: string;
        messageId: string;
        media: {
            type: string;
            mediaId: string | null;
            mimeType: string | null;
        };
        replyId?: string | null;
        replyTitle?: string | null;
    }): Promise<boolean> {
        const run = await prisma.guidedFlowRun.findUnique({
            where: { conversationId: params.conversationId },
            include: { flow: true }
        });

        if (run && run.status === "ACTIVE") {
            /**
             * Si el operador apagó el flujo, no se sigue atendiendo la
             * conversación con él: se cierra el run y el mensaje cae a los
             * flujos normales o a la IA.
             */
            if (!run.flow.isActive) {
                await this.complete(
                    params.conversationId,
                    run.currentStepId
                );
            } else {
                return this.advance({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                run,
                text: params.text,
                messageId: params.messageId,
                media: params.media,
                replyId: params.replyId ?? null,
                    replyTitle: params.replyTitle ?? null
                });
            }
        }

        const flow = await this.findMatching(
            params.workspaceId,
            params.text
        );

        if (!flow) {
            return false;
        }

        const parsed = guidedStepsSchema.safeParse(flow.steps);

        if (!parsed.success || parsed.data.length === 0) {
            return false;
        }

        const first = parsed.data[0];

        await prisma.guidedFlowRun.upsert({
            where: { conversationId: params.conversationId },
            create: {
                workspaceId: params.workspaceId,
                flowId: flow.id,
                conversationId: params.conversationId,
                currentStepId: first.id,
                status: "ACTIVE"
            },
            update: {
                flowId: flow.id,
                currentStepId: first.id,
                status: "ACTIVE",
                data: Prisma.DbNull
            }
        });

        await LogService.create({
            workspaceId: params.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.MESSAGE,
            action: "GUIDED_FLOW_STARTED",
            message: `Se inició el flujo guiado «${flow.name}».`,
            payload: {
                flowId: flow.id,
                conversationId: params.conversationId
            }
        }).catch(() => undefined);

        return this.sendFrom({
            workspaceId: params.workspaceId,
            conversationId: params.conversationId,
            flowId: flow.id,
            flowName: flow.name,
            steps: parsed.data,
            stepId: first.id
        });
    }

    static async panelForConversation(
        workspaceId: string,
        conversationId: string
    ): Promise<{
        flowName: string;
        status: string;
        currentStepId: string;
        fields: Array<{
            label: string;
            value: string;
            file: boolean;
            messageId?: string;
        }>;
    } | null> {
        const run = await prisma.guidedFlowRun.findFirst({
            where: { workspaceId, conversationId },
            include: { flow: true }
        });

        if (!run) {
            return null;
        }

        const parsed = guidedStepsSchema.safeParse(run.flow.steps);
        const steps = parsed.success ? parsed.data : [];
        const raw =
            run.data &&
            typeof run.data === "object" &&
            !Array.isArray(run.data)
                ? (run.data as Record<string, unknown>)
                : {};
        const fields: Array<{
            label: string;
            value: string;
            file: boolean;
            messageId?: string;
        }> = [];

        for (const [key, value] of Object.entries(raw)) {
            const step = steps.find(
                (item) =>
                    (item.type === "input" || item.type === "file") &&
                    item.field === key
            );
            const label = step && "label" in step ? step.label || key : key;

            if (
                value &&
                typeof value === "object" &&
                !Array.isArray(value) &&
                "messageId" in value
            ) {
                const file = value as {
                    messageId?: string;
                    mimeType?: string | null;
                    type?: string;
                };
                fields.push({
                    label,
                    value: file.mimeType || file.type || "Archivo recibido",
                    file: true,
                    messageId: file.messageId
                });
                continue;
            }

            fields.push({
                label,
                value: String(value ?? ""),
                file: false
            });
        }

        return {
            flowName: run.flow.name,
            status: run.status,
            currentStepId: run.currentStepId,
            fields
        };
    }

    private static async findMatching(workspaceId: string, text: string) {
        const flows = await prisma.guidedFlow.findMany({
            where: { workspaceId, isActive: true },
            orderBy: { createdAt: "asc" }
        });

        return (
            flows.find((flow) => guidedTriggerMatches(flow.trigger, text)) ||
            null
        );
    }

    private static async advance(params: {
        workspaceId: string;
        conversationId: string;
        run: {
            flowId: string;
            currentStepId: string;
            data: Prisma.JsonValue;
            flow: { name: string; steps: Prisma.JsonValue };
        };
        text: string;
        messageId: string;
        media: {
            type: string;
            mediaId: string | null;
            mimeType: string | null;
        };
        replyId: string | null;
        replyTitle: string | null;
    }): Promise<boolean> {
        const parsed = guidedStepsSchema.safeParse(params.run.flow.steps);

        if (!parsed.success) {
            await this.complete(params.conversationId, params.run.currentStepId);
            return true;
        }

        const current = findStep(parsed.data, params.run.currentStepId);

        if (!current) {
            await this.complete(params.conversationId, params.run.currentStepId);
            return true;
        }

        if (current.type === "file") {
            return this.handleFile({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                flowId: params.run.flowId,
                flowName: params.run.flow.name,
                steps: parsed.data,
                current,
                data: params.run.data,
                messageId: params.messageId,
                media: params.media
            });
        }

        if (current.type === "input") {
            return this.handleInput({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                flowId: params.run.flowId,
                flowName: params.run.flow.name,
                steps: parsed.data,
                current,
                data: params.run.data,
                text: params.text
            });
        }

        if (current.type !== "question") {
            await this.complete(params.conversationId, params.run.currentStepId);
            return true;
        }

        const normalizedText = params.text
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();

        const button =
            current.buttons.find((item) => item.id === params.replyId) ||
            current.buttons.find(
                (item) =>
                    item.title
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")
                        .toLowerCase()
                        .trim() === normalizedText
            );

        if (!button) {
            /** Si escribe en vez de tocar, se repite la pregunta. */
            await this.sendQuestion(
                params.workspaceId,
                params.conversationId,
                current
            );
            return true;
        }

        const next = current.next[button.id];

        if (!next) {
            await this.complete(params.conversationId, current.id);
            return true;
        }

        const previousData =
            params.run.data &&
            typeof params.run.data === "object" &&
            !Array.isArray(params.run.data)
                ? (params.run.data as Record<string, unknown>)
                : {};

        await prisma.guidedFlowRun.update({
            where: { conversationId: params.conversationId },
            data: {
                currentStepId: next,
                /** La opción elegida también queda como dato del flujo. */
                data: {
                    ...previousData,
                    [current.id]: button.title
                } as Prisma.InputJsonValue
            }
        });

        return this.sendFrom({
            workspaceId: params.workspaceId,
            conversationId: params.conversationId,
            flowId: params.run.flowId,
            flowName: params.run.flow.name,
            steps: parsed.data,
            stepId: next
        });
    }

    private static async handleFile(params: {
        workspaceId: string;
        conversationId: string;
        flowId: string;
        flowName: string;
        steps: GuidedStep[];
        current: Extract<GuidedStep, { type: "file" }>;
        data: Prisma.JsonValue;
        messageId: string;
        media: {
            type: string;
            mediaId: string | null;
            mimeType: string | null;
        };
    }): Promise<boolean> {
        const isImage = params.media.type === "IMAGE";
        const isDocument = params.media.type === "DOCUMENT";
        const accepted =
            Boolean(params.media.mediaId) &&
            (params.current.accept === "both"
                ? isImage || isDocument
                : params.current.accept === "image"
                  ? isImage
                  : isDocument);

        if (!accepted) {
            await MessageService.sendFlowReply({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                body:
                    params.current.accept === "image"
                        ? "Envía una foto, por favor."
                        : params.current.accept === "document"
                          ? "Envía el documento, por favor."
                          : "Envía una foto o un documento, por favor.",
                buttons: null,
                list: null
            });
            return true;
        }

        const base =
            params.data &&
            typeof params.data === "object" &&
            !Array.isArray(params.data)
                ? (params.data as Record<string, unknown>)
                : {};
        const nextData = {
            ...base,
            [params.current.field]: {
                messageId: params.messageId,
                mediaId: params.media.mediaId,
                type: params.media.type,
                mimeType: params.media.mimeType
            }
        };

        await prisma.guidedFlowRun.update({
            where: { conversationId: params.conversationId },
            data: {
                currentStepId: params.current.next,
                data: nextData as Prisma.InputJsonValue
            }
        });

        return this.sendFrom({
            workspaceId: params.workspaceId,
            conversationId: params.conversationId,
            flowId: params.flowId,
            flowName: params.flowName,
            steps: params.steps,
            stepId: params.current.next
        });
    }

    private static async handleInput(params: {
        workspaceId: string;
        conversationId: string;
        flowId: string;
        flowName: string;
        steps: GuidedStep[];
        current: Extract<GuidedStep, { type: "input" }>;
        data: Prisma.JsonValue;
        text: string;
    }): Promise<boolean> {
        const value = params.text.trim();

        if (!value) {
            await MessageService.sendFlowReply({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                body: params.current.text,
                buttons: null,
                list: null
            });
            return true;
        }

        let stored = value;

        if (params.current.inputType === "number") {
            const normalized = value.replace(/,/g, ".").replace(/[^0-9.-]/g, "");
            const number = Number(normalized);

            if (!Number.isFinite(number) || number <= 0) {
                await MessageService.sendFlowReply({
                    workspaceId: params.workspaceId,
                    conversationId: params.conversationId,
                    body: "Escribe un número válido, por favor.",
                    buttons: null,
                    list: null
                });
                return true;
            }

            stored = String(number);
        }

        const base =
            params.data &&
            typeof params.data === "object" &&
            !Array.isArray(params.data)
                ? (params.data as Record<string, unknown>)
                : {};
        const nextData = {
            ...base,
            [params.current.field]: stored
        };

        await prisma.guidedFlowRun.update({
            where: { conversationId: params.conversationId },
            data: {
                currentStepId: params.current.next,
                data: nextData as Prisma.InputJsonValue
            }
        });

        return this.sendFrom({
            workspaceId: params.workspaceId,
            conversationId: params.conversationId,
            flowId: params.flowId,
            flowName: params.flowName,
            steps: params.steps,
            stepId: params.current.next
        });
    }

    private static async sendFrom(params: {
        workspaceId: string;
        conversationId: string;
        flowId: string;
        flowName: string;
        steps: GuidedStep[];
        stepId: string;
    }): Promise<boolean> {
        let current = findStep(params.steps, params.stepId);

        for (let index = 0; index < MAX_CHAIN && current; index += 1) {
            if (current.type === "message") {
                await MessageService.sendFlowReply({
                    workspaceId: params.workspaceId,
                    conversationId: params.conversationId,
                    body: current.text,
                    buttons: null,
                    list: null
                });

                current = findStep(params.steps, current.next);
                continue;
            }

            if (current.type === "file") {
                await MessageService.sendFlowReply({
                    workspaceId: params.workspaceId,
                    conversationId: params.conversationId,
                    body: current.text,
                    buttons: null,
                    list: null
                });
                await prisma.guidedFlowRun.update({
                    where: { conversationId: params.conversationId },
                    data: { currentStepId: current.id }
                });
                return true;
            }

            if (current.type === "input") {
                await MessageService.sendFlowReply({
                    workspaceId: params.workspaceId,
                    conversationId: params.conversationId,
                    body: current.text,
                    buttons: null,
                    list: null
                });
                await prisma.guidedFlowRun.update({
                    where: { conversationId: params.conversationId },
                    data: { currentStepId: current.id }
                });
                return true;
            }

            if (current.type === "question") {
                await this.sendQuestion(
                    params.workspaceId,
                    params.conversationId,
                    current
                );
                await prisma.guidedFlowRun.update({
                    where: { conversationId: params.conversationId },
                    data: { currentStepId: current.id }
                });
                return true;
            }

            const links = current.links
                .map((link) => `${link.label}: ${link.url}`)
                .join("\n");
            const body = [current.text, links].filter(Boolean).join("\n\n");

            await MessageService.sendFlowReply({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                body,
                buttons: null,
                list: null
            });

            await this.complete(params.conversationId, current.id);

            await this.captureLead({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                flowId: params.flowId,
                flowName: params.flowName
            }).catch(async (error) => {
                await LogService.create({
                    workspaceId: params.workspaceId,
                    level: LogLevel.WARN,
                    module: LogModule.CONTACT,
                    action: "GUIDED_FLOW_LEAD_FAILED",
                    message: "No se pudo capturar el lead del flujo guiado.",
                    payload: {
                        flowId: params.flowId,
                        conversationId: params.conversationId,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error)
                    }
                }).catch(() => undefined);
            });

            if (current.handoff) {
                await AiAutoReplyService.handoff({
                    workspaceId: params.workspaceId,
                    conversationId: params.conversationId,
                    reason: "GUIDED_FLOW"
                }).catch(() => undefined);
            }

            await LogService.create({
                workspaceId: params.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.MESSAGE,
                action: "GUIDED_FLOW_COMPLETED",
                message: `El flujo guiado «${params.flowName}» terminó.`,
                payload: {
                    flowId: params.flowId,
                    conversationId: params.conversationId,
                    stepId: current.id
                }
            }).catch(() => undefined);

            return true;
        }

        return true;
    }

    private static async sendQuestion(
        workspaceId: string,
        conversationId: string,
        step: Extract<GuidedStep, { type: "question" }>
    ) {
        await MessageService.sendFlowReply({
            workspaceId,
            conversationId,
            body: step.text,
            buttons: step.buttons,
            list: null
        });
    }

    private static async captureLead(params: {
        workspaceId: string;
        conversationId: string;
        flowId: string;
        flowName: string;
    }) {
        const run = await prisma.guidedFlowRun.findUnique({
            where: { conversationId: params.conversationId },
            include: {
                flow: {
                    select: {
                        leadCapture: true,
                        leadNameField: true,
                        leadEmailField: true,
                        leadInterestField: true,
                        leadFields: true
                    }
                },
                conversation: {
                    select: {
                        contact: {
                            select: {
                                id: true,
                                profileName: true,
                                customName: true,
                                phone: true
                            }
                        }
                    }
                }
            }
        });

        if (!run?.flow.leadCapture) {
            return;
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: params.workspaceId },
            select: { leadsEnabled: true }
        });

        if (!workspace?.leadsEnabled) {
            return;
        }

        const data =
            run.data &&
            typeof run.data === "object" &&
            !Array.isArray(run.data)
                ? (run.data as Record<string, unknown>)
                : {};
        const value = (field: string | null) => {
            if (!field) {
                return null;
            }

            const raw = data[field];

            return typeof raw === "string" || typeof raw === "number"
                ? String(raw).trim()
                : null;
        };

        const mappedName = value(run.flow.leadNameField);
        const mappedEmail = value(run.flow.leadEmailField);
        const mappedInterest = value(run.flow.leadInterestField);
        const contact = run.conversation.contact;
        const email =
            mappedEmail && mappedEmail.includes("@") ? mappedEmail : null;
        const selected = new Set(run.flow.leadFields);
        const fields: Record<string, unknown> = {};

        for (const field of selected) {
            if (field in data) {
                fields[field] = data[field];
            }
        }

        await LeadService.capture({
            workspaceId: params.workspaceId,
            contactId: contact.id,
            conversationId: params.conversationId,
            name:
                mappedName ||
                contact.customName ||
                contact.profileName ||
                contact.phone ||
                "Sin nombre",
            phone: contact.phone,
            email,
            interest: mappedInterest || params.flowName,
            fields: fields as unknown as Prisma.InputJsonValue,
            source: "GUIDED_FLOW"
        });
    }

    private static async complete(conversationId: string, stepId: string) {
        await prisma.guidedFlowRun.updateMany({
            where: { conversationId },
            data: { status: "COMPLETED", currentStepId: stepId }
        });
    }
}
