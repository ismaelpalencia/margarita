import { NextFunction, Request, Response } from "express";

import { appConfig } from "../config/app.config";
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

        return next();
    } catch (error) {
        console.error("No se pudieron cargar los números:", error);

        res.locals.activeNumber = null;
        res.locals.activeNumbers = [];
        res.locals.currentPath = req.originalUrl;

        return next();
    }
}
