import { NextFunction, Request, Response } from "express";

import { appConfig } from "../config/app.config";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

let expectedOrigin: string | null = null;
let invalidUrlWarned = false;

function getAllowedOrigin(): string | null {
    if (expectedOrigin) {
        return expectedOrigin;
    }

    try {
        expectedOrigin = new URL(appConfig.appUrl).origin;
        return expectedOrigin;
    } catch {
        /* Se avisa una sola vez: si no, cada petición ensucia los logs. */
        if (!invalidUrlWarned) {
            invalidUrlWarned = true;

            console.warn(
                `[csrf] APP_URL no es una URL válida ("${appConfig.appUrl}"): la validación de origen queda desactivada. ` +
                    "Debe incluir el esquema, por ejemplo https://tu-dominio.up.railway.app"
            );
        }

        return null;
    }
}

/**
 * Protección CSRF basada en origen.
 *
 * Toda petición que cambia estado (POST, PUT, PATCH, DELETE) debe venir
 * del mismo origen que APP_URL. Los navegadores siempre envían `Origin`
 * (o al menos `Referer`) en ese tipo de peticiones, así que una página
 * externa que intente enviar un formulario a Margarita queda bloqueada.
 *
 * Las peticiones sin `Origin` ni `Referer` (curl, healthchecks, tests,
 * webhooks de Meta) se permiten: no son navegadores y ya están cubiertas
 * por otros controles.
 */
export function csrfProtection(
    req: Request,
    res: Response,
    next: NextFunction
) {
    if (SAFE_METHODS.has(req.method)) {
        return next();
    }

    /**
     * Meta no envía Origin ni Referer; ese endpoint ya valida la firma
     * HMAC de cada payload.
     */
    if (req.originalUrl.startsWith("/webhooks")) {
        return next();
    }

    /**
     * Socket.io valida el origen con su propia configuración de CORS y
     * exige una sesión válida en el handshake.
     */
    if (req.originalUrl.startsWith("/socket.io")) {
        return next();
    }

    const allowed = getAllowedOrigin();

    if (!allowed) {
        return next();
    }

    const origin = req.get("origin");
    const referer = req.get("referer");

    let source: string | null = origin || null;

    if (!source && referer) {
        try {
            source = new URL(referer).origin;
        } catch {
            source = null;
        }
    }

    if (!source) {
        return next();
    }

    if (source !== allowed) {
        console.warn(
            `[csrf] Petición bloqueada desde ${source} hacia ${req.method} ${req.originalUrl}`
        );

        return res
            .status(403)
            .type("html")
            .send(
                "<h1>403</h1><p>Solicitud bloqueada: el origen no coincide con la aplicación.</p>"
            );
    }

    return next();
}
