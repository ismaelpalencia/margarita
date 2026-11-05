import assert from "node:assert/strict";
import http from "node:http";
import test, { after, before } from "node:test";

import {
    AiMode,
    MessageDirection,
    MessageSource,
    OffHoursMode
} from "@prisma/client";

import { appConfig } from "../../src/config/app.config";
import { prisma } from "../../src/config/prisma";
import { MetaWebhookHandlerService } from "../../src/services/meta-webhook-handler.service";
import { localClockIn } from "../../src/utils/business-hours";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    rawPrisma,
    testPhone,
    WorkspaceFixture
} from "./helpers";

/**
 * Fuera de horario: el mensaje que llega con el horario 9–18 no dispara la IA,
 * responde el mensaje configurado y deja el hilo sin asignar para la mañana.
 * Se usa un servidor Graph simulado para comprobar el envío.
 */

let fixture: WorkspaceFixture;
let mockGraph: http.Server;
let mockGraphPort = 0;
const originalGraphBaseUrl = appConfig.graphBaseUrl;
const originalAiEnabled = appConfig.ai.enabled;
const originalAiProvider = appConfig.ai.provider;

before(async () => {
    fixture = await createWorkspaceFixture();

    mockGraph = http.createServer((_req, res) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ messages: [{ id: `wamid.mock.${Date.now()}` }] }));
    });

    await new Promise<void>((resolve) => {
        mockGraph.listen(0, "127.0.0.1", () => {
            const address = mockGraph.address();

            if (address && typeof address === "object") {
                mockGraphPort = address.port;
            }

            resolve();
        });
    });

    appConfig.graphBaseUrl = `http://127.0.0.1:${mockGraphPort}`;
});

after(async () => {
    appConfig.graphBaseUrl = originalGraphBaseUrl;
    appConfig.ai.enabled = originalAiEnabled;
    appConfig.ai.provider = originalAiProvider;
    await new Promise<void>((resolve) => mockGraph.close(() => resolve()));
    await cleanupWorkspace(fixture.workspaceId);
    await disconnectFixtures();
    await prisma.$disconnect();
});

function outsideHoursConfig() {
    const today = localClockIn("America/Mexico_City", new Date()).day;
    const days = [0, 1, 2, 3, 4, 5, 6].filter((day) => day !== today);

    return { timezone: "America/Mexico_City", days, start: "09:00", end: "18:00" };
}

function textPayload(params: { from: string; body: string; wamid: string }) {
    return {
        object: "whatsapp_business_account",
        entry: [
            {
                id: `waba-${fixture.workspaceId}`,
                changes: [
                    {
                        field: "messages",
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "5215500000000",
                                phone_number_id: fixture.phoneNumberId
                            },
                            contacts: [
                                { profile: { name: "Cliente Fuera de horario" }, wa_id: params.from }
                            ],
                            messages: [
                                {
                                    from: params.from,
                                    id: params.wamid,
                                    timestamp: String(Math.floor(Date.now() / 1000)),
                                    type: "text",
                                    text: { body: params.body }
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    };
}

async function enableHours(mode: OffHoursMode, message: string | null) {
    await prisma.workspace.update({
        where: { id: fixture.workspaceId },
        data: {
            businessHoursEnabled: true,
            businessHours: outsideHoursConfig(),
            offHoursMode: mode,
            offHoursMessage: message,
            offHoursReplyIntervalHours: 12
        }
    });
}

async function conversationForWamid(wamid: string) {
    const inbound = await prisma.message.findUniqueOrThrow({
        where: { wamid },
        select: { conversationId: true }
    });

    return prisma.conversation.findUniqueOrThrow({
        where: { id: inbound.conversationId },
        include: {
            messages: {
                where: {
                    direction: MessageDirection.OUT,
                    source: MessageSource.AUTOMATIC
                },
                orderBy: { createdAt: "asc" }
            }
        }
    });
}

test("TEXT_ONLY responde el mensaje fuera de horario y no dispara la IA", async () => {
    await enableHours(OffHoursMode.TEXT_ONLY, "Estamos cerrados. Te respondemos mañana.");

    const rawWorkspace = await rawPrisma().workspace.findUniqueOrThrow({
        where: { id: fixture.workspaceId },
        select: { offHoursMessage: true }
    });

    assert.ok(
        rawWorkspace.offHoursMessage?.startsWith("enc:v1:"),
        "el mensaje fuera de horario queda cifrado en la base"
    );

    const phone = testPhone();
    const wamid = `wamid.offhours.text.${Date.now()}`;

    await MetaWebhookHandlerService.handleIncomingPayload(
        textPayload({ from: phone, body: "¿me ayudan?", wamid }) as never
    );

    const conversation = await conversationForWamid(wamid);

    assert.equal(conversation.assignedUserId, null, "fuera de horario no se asigna a nadie");
    assert.equal(conversation.messages.length, 1, "debe salir exactamente una respuesta");
    assert.equal(conversation.messages[0].body, "Estamos cerrados. Te respondemos mañana.");

    const aiJobs = await prisma.aiSuggestionJob.count({
        where: { workspaceId: fixture.workspaceId }
    });

    assert.equal(aiJobs, 0, "fuera de horario no se debe encolar la IA");

    const replyLog = await prisma.log.findFirst({
        where: { workspaceId: fixture.workspaceId, action: "OFF_HOURS_REPLY_SENT" }
    });

    assert.ok(replyLog, "la respuesta queda auditada como OFF_HOURS_REPLY_SENT");
    assert.equal((replyLog!.payload as { mode?: string }).mode, "TEXT_ONLY");

    const queuedLog = await prisma.log.findFirst({
        where: { workspaceId: fixture.workspaceId, action: "OFF_HOURS_QUEUED" }
    });

    assert.ok(queuedLog, "el hilo queda auditado como OFF_HOURS_QUEUED");
});

test("QUEUE_ONLY no responde y deja el hilo para la mañana", async () => {
    await enableHours(OffHoursMode.QUEUE_ONLY, null);

    const phone = testPhone();
    const wamid = `wamid.offhours.queue.${Date.now()}`;

    await MetaWebhookHandlerService.handleIncomingPayload(
        textPayload({ from: phone, body: "hola", wamid }) as never
    );

    const conversation = await conversationForWamid(wamid);

    assert.equal(conversation.assignedUserId, null, "no se asigna fuera de horario");
    assert.equal(conversation.messages.length, 0, "QUEUE_ONLY no debe responder");

    const queuedLog = await prisma.log.findFirst({
        where: { workspaceId: fixture.workspaceId, action: "OFF_HOURS_QUEUED" }
    });

    assert.ok(queuedLog, "queda auditado como OFF_HOURS_QUEUED");
});

test("AI_IF_COVERED sin cobertura entrega con motivo OFF_HOURS", async () => {
    await enableHours(OffHoursMode.AI_IF_COVERED, "No estamos disponibles ahora.");

    const phone = testPhone();
    const wamid = `wamid.offhours.aifallback.${Date.now()}`;

    await MetaWebhookHandlerService.handleIncomingPayload(
        textPayload({ from: phone, body: "¿hacen envíos?", wamid }) as never
    );

    const conversation = await conversationForWamid(wamid);

    assert.equal(
        conversation.aiHandoffReason,
        "OFF_HOURS",
        "sin cobertura, la entrega lleva el motivo OFF_HOURS"
    );

    assert.equal(conversation.messages.length, 1, "responde el mensaje fuera de horario");
});

test("AI_IF_COVERED con cobertura responde con IA", async () => {
    appConfig.ai.enabled = true;
    appConfig.ai.provider = "mock";

    await prisma.aiSettings.upsert({
        where: { workspaceId: fixture.workspaceId },
        create: {
            workspaceId: fixture.workspaceId,
            enabled: true,
            mode: AiMode.SUGGEST,
            confidenceMin: 0.7
        },
        update: { enabled: true, mode: AiMode.SUGGEST, confidenceMin: 0.7 }
    });

    await prisma.knowledgeEntry.create({
        data: {
            workspaceId: fixture.workspaceId,
            question: "¿Cuál es el horario de atención?",
            answer: "Abrimos de lunes a viernes de 9:00 a 18:00.",
            keywords: ["horario", "abren", "cierran"],
            priority: 10,
            isActive: true
        }
    });

    await enableHours(OffHoursMode.AI_IF_COVERED, "No estamos disponibles ahora.");

    const phone = testPhone();
    const wamid = `wamid.offhours.ai.${Date.now()}`;

    await MetaWebhookHandlerService.handleIncomingPayload(
        textPayload({ from: phone, body: "¿cuál es el horario?", wamid }) as never
    );

    const conversation = await conversationForWamid(wamid);

    assert.equal(conversation.messages.length, 1, "con cobertura, la IA responde una vez");
    assert.match(conversation.messages[0].body || "", /9:00/, "la respuesta viene de la base");

    const replyLog = await prisma.log.findFirst({
        where: { workspaceId: fixture.workspaceId, action: "OFF_HOURS_REPLY_SENT" },
        orderBy: { createdAt: "desc" }
    });

    assert.equal(
        (replyLog!.payload as { mode?: string }).mode,
        "AI_IF_COVERED",
        "la respuesta de IA queda auditada con su modo"
    );
});
