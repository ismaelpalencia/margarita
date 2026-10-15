import assert from "node:assert/strict";
import test from "node:test";

import { UserRole } from "@prisma/client";
import bcrypt from "bcrypt";

import { prisma } from "../../src/config/prisma";
import { SetupService } from "../../src/services/setup.service";
import { destructiveAllowed } from "./helpers";

/**
 * Alta de una instalación nueva (el camino que recorre un cliente que acaba
 * de desplegar). Necesita una base **vacía**, así que solo corre con
 * `INTEGRATION_DESTRUCTIVE=1` —en CI, donde la base es desechable— y se
 * niega a tocar una instalación con datos.
 */

test(
    "una instalación vacía se configura desde el asistente y queda operativa",
    { skip: !destructiveAllowed() },
    async () => {
        const existing = await prisma.workspace.count();

        assert.equal(
            existing,
            0,
            "esta prueba necesita una base vacía: no se ejecuta contra una instalación con datos"
        );

        assert.equal(
            await SetupService.isConfigured(),
            false,
            "sin empresa, la instalación no está configurada"
        );

        const id = Date.now().toString(36);
        const adminEmail = `admin-${id}@ejemplo.mx`;
        const adminPassword = "ClaveInicial123";

        await SetupService.createWorkspace({
            workspaceName: `Despacho ${id}`,
            workspaceSlug: `despacho-${id}`,
            adminName: "Ana Cobranza",
            adminEmail,
            adminPassword
        });

        assert.equal(
            await SetupService.isConfigured(),
            true,
            "al crear la empresa, el asistente se cierra solo"
        );

        const admin = await prisma.user.findUniqueOrThrow({
            where: { email: adminEmail },
            select: {
                id: true,
                workspaceId: true,
                role: true,
                isActive: true,
                password: true,
                workspace: { select: { settings: { select: { id: true } } } }
            }
        });

        assert.equal(admin.role, UserRole.ADMIN);
        assert.equal(admin.isActive, true);
        assert.ok(
            admin.workspace.settings,
            "la empresa nace con su configuración operativa"
        );
        assert.ok(
            await bcrypt.compare(adminPassword, admin.password),
            "la contraseña del alta queda guardada con hash"
        );

        /** El asistente ya no se puede volver a usar. */
        await assert.rejects(
            () =>
                SetupService.createWorkspace({
                    workspaceName: "Otra",
                    workspaceSlug: "otra",
                    adminName: "Otra",
                    adminEmail: "otra@ejemplo.mx",
                    adminPassword: "ClaveInicial123"
                }),
            /ya está configurada/i,
            "no debe poder configurarse dos veces"
        );

        /** Limpieza: la base queda como estaba (vacía). */
        await prisma.log.deleteMany({
            where: { workspaceId: admin.workspaceId }
        });
        await prisma.workspace.delete({
            where: { id: admin.workspaceId }
        });

        assert.equal(await prisma.workspace.count(), 0, "la base queda vacía otra vez");
    }
);
