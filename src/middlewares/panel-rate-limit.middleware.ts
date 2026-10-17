import { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";

import { appConfig } from "../config/app.config";

/**
 * Límite de peticiones **por persona**, no por dirección de internet.
 *
 * El tope global de `app.ts` es por IP y sirve como defensa de borde; este otro
 * va después de autenticar y cuenta por usuario. Así quince agentes en la misma
 * oficina —que comparten una sola IP— no se roban el cupo entre ellos, que es
 * justo lo que la página promete: «usuarios ilimitados».
 */
export function panelRateLimitKey(req: Request): string {
    const user = req.user;

    return user ? `user:${user.id}` : `ip:${req.ip}`;
}

/**
 * Respuesta del 429. Dice cuánto falta para poder volver a intentar; un
 * «error» a secas deja a la persona sin saber si esperar o llamar a soporte.
 */
export function tooManyRequestsResponse(
    req: Request,
    res: Response,
    _next: NextFunction,
    options: { windowMs: number; statusCode?: number }
): void {
    /**
     * `express-rate-limit` deja el estado en `req.rateLimit`, pero su
     * definición de tipos no siempre se carga con `@types/express`. Se lee con
     * un tipo explícito para no depender de eso.
     */
    const rateLimitState = (
        req as Request & { rateLimit?: { resetTime?: Date } }
    ).rateLimit;
    const reset = rateLimitState?.resetTime;
    const milliseconds = reset
        ? Math.max(0, reset.getTime() - Date.now())
        : options.windowMs;
    const minutes = Math.max(1, Math.ceil(milliseconds / 60000));

    res.setHeader("Retry-After", String(Math.ceil(milliseconds / 1000)));
    res.status(options.statusCode ?? 429);
    res.type("text/plain; charset=utf-8");
    res.send(
        `Hiciste demasiadas acciones seguidas. Espera ${minutes} ${
            minutes === 1 ? "minuto" : "minutos"
        } y vuelve a intentar. Si crees que es un error, avísanos a ${
            appConfig.supportEmail || "soporte"
        }.`
    );
}

export const panelRateLimiter = rateLimit({
    windowMs: appConfig.panelRateLimitWindowMinutes * 60 * 1000,
    max: appConfig.panelRateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: panelRateLimitKey,
    handler: tooManyRequestsResponse
});
