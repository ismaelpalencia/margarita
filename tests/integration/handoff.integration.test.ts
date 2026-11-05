import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { UserRole, UserStatus } from "@prisma/client";

import { prisma } from "../../src/config/prisma";
import { AssignmentService } from "../../src/services/assignment.service";
import { ConversationService } from "../../src/services/conversation.service";
import { runHandoffEscalation } from "../../src/jobs/handoff-escalation.job";
import { contactPhoneFields } from "../../src/utils/phone";
import { emailIndex } from "../../src/utils/email";
import bcrypt from "bcrypt";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    randomId,
    testPhone,
    WorkspaceFixture
} from "./helpers";

let fixture: WorkspaceFixture;

before(async () => {
    fixture = await createWorkspaceFixture();
});

after(async () => {
    await cleanupWorkspace(fixture.workspaceId);
    await disconnectFixtures();
    await prisma.$disconnect();
});

async function createUser(role: UserRole, status: UserStatus, name: string) {
    return prisma.user.create({
        data: {
            workspaceId: fixture.workspaceId,
            name,
            email: name + "-" + randomId() + "@ejemplo.mx",
            emailHash: emailIndex(name + "-" + randomId() + "@ejemplo.mx"),
            password: await bcrypt.hash("Clave123456", 4),
            role,
            status,
            isActive: true
        }
    });
}

async function createConversation() {
    const contact = await prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(testPhone()),
            customName: "Cliente handoff"
        }
    });

    const conversation = await prisma.conversation.create({
        data: {
            workspaceId: fixture.workspaceId,
            contactId: contact.id,
            whatsappNumberId: fixture.numberId,
            source: "INBOUND"
        }
    });

    return conversation;
}

test("sin AVAILABLE asigna al agente BUSY con menos carga", async () => {
    const busyA = await createUser(UserRole.AGENT, UserStatus.BUSY, "Busy A");
    const busyB = await createUser(UserRole.AGENT, UserStatus.BUSY, "Busy B");

    /** Busy A ya tiene una conversación; Busy B no. */
    const loaded = await createConversation();

    await prisma.conversation.update({
        where: { id: loaded.id },
        data: { assignedUserId: busyA.id }
    });

    const conversation = await createConversation();

    await AssignmentService.assignLeastBusyAgent({
        workspaceId: fixture.workspaceId,
        conversationId: conversation.id
    });

    const updated = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id }
    });

    /** Busy B tiene 0 carga; Busy A ya tiene 1. */
    assert.notEqual(updated.assignedUserId, null, "se asignó a un BUSY");
    assert.notEqual(updated.assignedUserId, busyA.id, "elige el de menos carga");

    const log = await prisma.log.findFirst({
        where: { workspaceId: fixture.workspaceId, action: "HANDOFF_ASSIGNED_FALLBACK" }
    });

    assert.ok(log, "queda auditado como fallback");
    assert.equal((log!.payload as { step?: string }).step, "BUSY_LEAST_BUSY");
});

test("sin agentes, asigna a un admin con sesión activa", async () => {
    /** Deja a todos los agentes fuera para llegar a la rama de admin. */
    await prisma.user.updateMany({
        where: { workspaceId: fixture.workspaceId, role: UserRole.AGENT },
        data: { status: UserStatus.OFFLINE }
    });

    const admin = await prisma.user.findFirstOrThrow({
        where: { workspaceId: fixture.workspaceId, role: UserRole.ADMIN }
    });

    await prisma.userSession.create({
        data: {
            userId: admin.id,
            tokenId: "tok-" + randomId(),
            isActive: true,
            expiresAt: new Date(Date.now() + 3600_000)
        }
    });

    const conversation = await createConversation();

    await AssignmentService.assignLeastBusyAgent({
        workspaceId: fixture.workspaceId,
        conversationId: conversation.id
    });

    const updated = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id }
    });

    assert.equal(updated.assignedUserId, admin.id, "se asignó al admin");
});

test("sin nadie, queda sin asignar y se puede reclamar", async () => {
    /** Sin admin automático: aunque haya admin con sesión, queda sin asignar. */
    await prisma.workspace.update({
        where: { id: fixture.workspaceId },
        data: { autoAssignToAdmin: false }
    });

    const conversation = await createConversation();

    await AssignmentService.assignLeastBusyAgent({
        workspaceId: fixture.workspaceId,
        conversationId: conversation.id
    });

    const unassigned = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id }
    });

    assert.equal(unassigned.assignedUserId, null, "queda sin asignar");
    assert.equal(await ConversationService.countUnassigned(fixture.workspaceId) >= 1, true);

    const claimer = await createUser(UserRole.AGENT, UserStatus.AVAILABLE, "Claimer");

    await ConversationService.claim(fixture.workspaceId, conversation.id, claimer.id);

    const claimed = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id }
    });

    assert.equal(claimed.assignedUserId, claimer.id, "se reclamó");

    const log = await prisma.log.findFirst({
        where: { workspaceId: fixture.workspaceId, action: "HANDOFF_CLAIMED" }
    });

    assert.ok(log, "queda auditado como HANDOFF_CLAIMED");
});

test("escala una conversación sin asignar pasados los minutos", async () => {
    const conversation = await createConversation();

    await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date(Date.now() - 20 * 60 * 1000) }
    });

    await prisma.workspace.update({
        where: { id: fixture.workspaceId },
        data: { handoffEscalationMinutes: 15 }
    });

    const escalated = await runHandoffEscalation();

    assert.ok(escalated >= 1, "escaló al menos una conversación");

    const updated = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversation.id }
    });

    assert.ok(updated.handoffEscalatedAt, "marca la escalación");

    const log = await prisma.log.findFirst({
        where: { workspaceId: fixture.workspaceId, action: "HANDOFF_ESCALATED" }
    });

    assert.ok(log, "queda auditado como HANDOFF_ESCALATED");
});