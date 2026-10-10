import { NextFunction, Request, Response } from "express";

import { appConfig } from "../config/app.config";
import { logger } from "../config/logger";
import { checkRequestOrigin } from "./origin-check";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

let invalidUrlWarned = false;
let schemeMismatchWarned = false;

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
        switch (character) {
            case "&":
                return "&amp;";
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case '"':
                return "&quot;";
            default:
                return "&#39;";
        }
    });
}

function warnInvalidAppUrl() {
    /* Se avisa una sola vez: si no, cada petición ensucia los logs. */
    if (invalidUrlWarned) {
        return;
    }

    invalidUrlWarned = true;

    console.warn(
        `[csrf] APP_URL no es una URL válida ("${appConfig.appUrl}"): la validación de origen queda desactivada. ` +
            "Debe incluir el esquema, por ejemplo https://tu-dominio.up.railway.app"
    );
}

function isValidAppUrl(): boolean {
    try {
        new URL(appConfig.appUrl);
        return true;
    } catch {
        warnInvalidAppUrl();
        return false;
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

    if (!isValidAppUrl()) {
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

    const verdict = checkRequestOrigin(source, appConfig.appUrl);

    if (!verdict.allowed) {
        /**
         * El mensaje incluye el origen recibido y el esperado: sin eso,
         * un dominio mal configurado es indescifrable desde el navegador.
         */
        logger.warn(
            {
                receivedOrigin: source,
                expectedUrl: appConfig.appUrl,
                method: req.method,
                path: req.originalUrl,
                reason: verdict.reason
            },
            "Petición bloqueada por origen no permitido"
        );

        const received = escapeHtml(source);
        const expected = escapeHtml(appConfig.appUrl);

        return res
            .status(403)
            .type("html")
            .send(
                "<h1>403 — origen no permitido</h1>" +
                    `<p>La petición llegó desde <code>${received}</code>, pero APP_URL está configurada como <code>${expected}</code>.</p>` +
                    "<p>Ábre la aplicación exactamente en la URL configurada en APP_URL, o corrige esa variable en Railway.</p>"
            );
    }

    if (verdict.schemeMismatch && !schemeMismatchWarned) {
        schemeMismatchWarned = true;

        logger.warn(
            {
                receivedOrigin: source,
                expectedUrl: appConfig.appUrl
            },
            "Llegó una petición por un esquema distinto (http/https) al de APP_URL; se permite porque el dominio coincide."
        );
    }

    return next();
}
