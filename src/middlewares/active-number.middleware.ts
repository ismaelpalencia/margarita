import { UserRole } from "@prisma/client";
import { NextFunction, Request, Response } from "express";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { ConversationService } from "../services/conversation.service";
import { WhatsAppNumberService } from "../services/whatsapp-number.service";

/**
 * Resuelve con qué número trabaja el usuario.
 *
 * El panel funciona "desde" un número: la bandeja, las campañas y las
 * conversaciones nuevas usan el número activo. El usuario lo elige con el
 * selector del encabezado y la elección se guarda en una cookie.
 *
 * Si la cookie apunta a un número que ya no existe o está desactivado, se
 * cae al primero activo en lugar de fallar.
 */
export async function activeNumberMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const numbers = await WhatsAppNumberService.listNumbers(
            req.user!.workspaceId
        );

        const requested = req.cookies?.[appConfig.activeNumberCookieName];

        const active =
            numbers.find((number) => number.id === requested && number.isActive) ||
            numbers.find((number) => number.isActive) ||
            numbers[0] ||
            null;

        req.activeNumber = active;
        res.locals.activeNumber = active;
        res.locals.activeNumbers = numbers;
        res.locals.currentPath = req.originalUrl;

        /**
         * Aviso de mensajes sin leer del número activo. Solo se calcula al
         * pintar una página (GET): en un POST la respuesta es un redirect.
         */
        res.locals.unreadTotal = 0;

        /** Preferencias de notificación del usuario, para live.js. */
        const me = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: { notifySoundEnabled: true, notifyBrowserEnabled: true }
        });

        res.locals.notifySoundEnabled = Boolean(me?.notifySoundEnabled);
        res.locals.notifyBrowserEnabled = Boolean(me?.notifyBrowserEnabled);

        res.locals.unassignedCount = 0;

        if (req.method === "GET") {
            try {
                res.locals.unassignedCount =
                    await ConversationService.countUnassigned(
                        req.user!.workspaceId
                    );
                res.locals.unreadTotal = await ConversationService.countUnread({
                    workspaceId: req.user!.workspaceId,
                    whatsappNumberId: active?.id,
                    assignedUserId:
                        req.user!.role === UserRole.AGENT
                            ? req.user!.id
                            : undefined
                });
            } catch {
                /** Si la base todavía no tiene la columna, la página sigue. */
                res.locals.unreadTotal = 0;
            }
        }

        return next();
    } catch (error) {
        console.error("No se pudieron cargar los números:", error);

        res.locals.activeNumber = null;
        res.locals.activeNumbers = [];
        res.locals.currentPath = req.originalUrl;
        res.locals.unreadTotal = 0;

        return next();
    }
}
