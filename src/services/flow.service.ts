import fs from "node:fs";
import path from "node:path";

import { LogLevel, LogModule, Prisma } from "@prisma/client";

import { prisma } from "../config/prisma";
import { LogService } from "./log.service";
import { MessageService } from "./message.service";
import { FlowButton, FlowList, flowTriggerMatches, normalizeFlowText } from "../utils/flow";

export type FlowSeed = {
    slug: string;
    name: string;
    trigger: string;
    reply: string;
    buttons?: FlowButton[];
    list?: FlowList;
};

export type KbSeed = {
    question: string;
    answer: string;
    tags: string[];
};

export type VerticalPackage = {
    vertical: string;
    label: string;
    flows: FlowSeed[];
    kb: KbSeed[];
};

export const VERTICALS = ["comercio", "servicios", "generico"] as const;

function toPrismaJson(value: unknown): Prisma.InputJsonValue | undefined {
    return value == null
        ? undefined
        : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}

export class FlowService {
    static readPackage(vertical: string): VerticalPackage {
        const file = path.join(process.cwd(), "seeds", "verticals", `${vertical}.json`);
        const raw = fs.readFileSync(file, "utf8");

        return JSON.parse(raw) as VerticalPackage;
    }

    static listPackages(): VerticalPackage[] {
        return VERTICALS.map((vertical) => FlowService.readPackage(vertical));
    }

    /**
     * Carga un paquete por vertical. Idempotente por slug (flujos) y por
     * sourceKey (base de conocimiento): lo que ya existe no se pisa, así que
     * una edición previa del cliente se conserva. Devuelve lo creado vs omitido.
     */
    static async loadPackage(params: {
        workspaceId: string;
        userId: string;
        vertical: string;
        flowSlugs: string[];
        kbIndexes: number[];
    }) {
        const pkg = FlowService.readPackage(params.vertical);
        const selectedFlows = pkg.flows.filter((flow) =>
            params.flowSlugs.includes(flow.slug)
        );
        const selectedKb = pkg.kb.filter((_entry, index) =>
            params.kbIndexes.includes(index)
        );

        let flowsCreated = 0;
        let flowsSkipped = 0;
        let kbCreated = 0;
        let kbSkipped = 0;

        for (const flow of selectedFlows) {
            const existing = await prisma.flow.findUnique({
                where: { workspaceId_slug: { workspaceId: params.workspaceId, slug: flow.slug } }
            });

            if (existing) {
                flowsSkipped += 1;
                continue;
            }

            await prisma.flow.create({
                data: {
                    workspaceId: params.workspaceId,
                    slug: flow.slug,
                    name: flow.name,
                    trigger: flow.trigger,
                    reply: flow.reply,
                    buttons: toPrismaJson(flow.buttons?.length ? flow.buttons : null),
                    list: toPrismaJson(flow.list || null),
                    isActive: true
                }
            });

            flowsCreated += 1;
        }

        for (const entry of selectedKb) {
            const sourceKey = `${params.vertical}::${normalizeFlowText(entry.question)}`;
            const existing = await prisma.knowledgeEntry.findUnique({
                where: { workspaceId_sourceKey: { workspaceId: params.workspaceId, sourceKey } }
            });

            if (existing) {
                kbSkipped += 1;
                continue;
            }

            await prisma.knowledgeEntry.create({
                data: {
                    workspaceId: params.workspaceId,
                    createdById: params.userId,
                    question: entry.question,
                    answer: entry.answer,
                    keywords: entry.tags || [],
                    priority: 0,
                    isActive: true,
                    sourceKey
                }
            });

            kbCreated += 1;
        }

        /** Cargar un paquete enciende el motor (es el opt-in explícito). */
        await prisma.workspace.update({
            where: { id: params.workspaceId },
            data: { flowsEnabled: true }
        });

        await LogService.create({
            workspaceId: params.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.AI,
            action: "FLOW_PACKAGE_LOADED",
            message: `Se cargó el paquete inicial ${pkg.label}.`,
            payload: {
                vertical: params.vertical,
                flowsCreated,
                flowsSkipped,
                kbCreated,
                kbSkipped
            }
        }).catch(() => undefined);

        return { flowsCreated, flowsSkipped, kbCreated, kbSkipped };
    }

    /** ¿Existe un flujo activo cuyo trigger esté en el texto? */
    static async findMatching(workspaceId: string, text: string) {
        if (!text) {
            return null;
        }

        const flows = await prisma.flow.findMany({
            where: { workspaceId, isActive: true },
            orderBy: { updatedAt: "desc" }
        });

        return flows.find((flow) => flowTriggerMatches(flow.trigger, text)) ?? null;
    }

    /**
     * Dispara un flujo: envía su respuesta (con botones o lista) y lo audita.
     * Devuelve false si ningún flujo coincide o el envío falla.
     */
    static async trigger(params: {
        workspaceId: string;
        conversationId: string;
        messageId: string;
        text: string;
    }): Promise<boolean> {
        const flow = await FlowService.findMatching(params.workspaceId, params.text);

        if (!flow) {
            return false;
        }

        try {
            /** Si las listas están apagadas, el flujo sale como texto. */
            const workspace = await prisma.workspace.findUnique({
                where: { id: params.workspaceId },
                select: { interactiveListsEnabled: true }
            });
            const listEnabled = Boolean(workspace?.interactiveListsEnabled);
            const list = listEnabled
                ? ((flow.list as FlowList | null) ?? null)
                : null;
            const buttons = list
                ? null
                : ((flow.buttons as FlowButton[] | null) ?? null);

            const message = await MessageService.sendFlowReply({
                workspaceId: params.workspaceId,
                conversationId: params.conversationId,
                body: flow.reply,
                buttons,
                list
            });

            await LogService.create({
                workspaceId: params.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.MESSAGE,
                action: "FLOW_TRIGGERED",
                message: `El flujo «${flow.name}» respondió al mensaje entrante.`,
                payload: {
                    flowId: flow.id,
                    flowSlug: flow.slug,
                    conversationId: params.conversationId,
                    messageId: params.messageId,
                    replyMessageId: message.id
                }
            }).catch(() => undefined);

            return true;
        } catch {
            return false;
        }
    }
}