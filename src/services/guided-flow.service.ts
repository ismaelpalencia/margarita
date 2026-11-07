import { LogLevel, LogModule, Prisma } from "@prisma/client";

import { prisma } from "../config/prisma";
import { MessageService } from "./message.service";
import { LogService } from "./log.service";
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
        replyId?: string | null;
        replyTitle?: string | null;
    }): Promise<boolean> {
        const run = await prisma.guidedFlowRun.findUnique({
            where: { conversationId: params.conversationId },
            include: { flow: true }
        });

        if (run && run.status === "ACTIVE") {
            return this.advance({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                run,
                text: params.text,
                replyId: params.replyId ?? null,
                replyTitle: params.replyTitle ?? null
            });
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
            flow: { name: string; steps: Prisma.JsonValue };
        };
        text: string;
        replyId: string | null;
        replyTitle: string | null;
    }): Promise<boolean> {
        const parsed = guidedStepsSchema.safeParse(params.run.flow.steps);

        if (!parsed.success) {
            await this.complete(params.conversationId, params.run.currentStepId);
            return true;
        }

        const current = findStep(parsed.data, params.run.currentStepId);

        if (!current || current.type !== "question") {
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

        await prisma.guidedFlowRun.update({
            where: { conversationId: params.conversationId },
            data: { currentStepId: next }
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

    private static async complete(conversationId: string, stepId: string) {
        await prisma.guidedFlowRun.updateMany({
            where: { conversationId },
            data: { status: "COMPLETED", currentStepId: stepId }
        });
    }
}
