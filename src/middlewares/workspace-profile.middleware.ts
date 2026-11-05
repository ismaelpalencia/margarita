import { WorkspaceProfile } from "@prisma/client";
import { NextFunction, Request, Response } from "express";

import { prisma } from "../config/prisma";
import { isWithinBusinessHours, parseBusinessHours } from "../utils/business-hours";
import {
    isCollectionsProfile,
    modulesForProfile
} from "../utils/workspace-profile";

/**
 * Deja el giro de la instalación disponible en la petición y en las vistas.
 *
 * Se aplica después de autenticar y antes de montar los módulos del panel.
 * Si la consulta falla (por ejemplo, en una base a la que todavía le falta la
 * migración del perfil), se asume COBRANZA: es el comportamiento que tenía la
 * herramienta antes de existir este interruptor, así que nada desaparece por
 * un error de lectura.
 */
export async function workspaceProfileMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    let profile: WorkspaceProfile = WorkspaceProfile.COBRANZA;
    let offHoursNow = false;

    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: req.user!.workspaceId },
            select: {
                profile: true,
                businessHoursEnabled: true,
                businessHours: true
            }
        });

        profile = workspace?.profile ?? WorkspaceProfile.COBRANZA;

        const hours = workspace?.businessHoursEnabled
            ? parseBusinessHours(workspace.businessHours)
            : null;

        offHoursNow = hours ? !isWithinBusinessHours(hours, new Date()) : false;
    } catch (error) {
        console.error("No se pudo leer el giro de la instalación:", error);
    }

    req.workspaceProfile = profile;
    res.locals.workspaceProfile = profile;
    res.locals.workspaceModules = modulesForProfile(profile);
    /** Atajo para las plantillas que solo necesitan saber si hay cobranza. */
    res.locals.collectionsEnabled = isCollectionsProfile(profile);
    /** Badge "Fuera de horario" en el panel y en el hilo. */
    res.locals.offHoursNow = offHoursNow;

    return next();
}

/**
 * Defensa de las rutas que solo tienen sentido con cobranza encendida.
 *
 * La interfaz ya esconde los enlaces y paneles, pero una petición directa a
 * `/admin/reports` o `/admin/replies` no debe seguir funcionando cuando el
 * giro es comercial. Los datos siguen en la base: apagar el módulo no borra
 * nada, y al volver a COBRANZA todo queda como estaba.
 */
export function requireCollectionsModule(
    req: Request,
    res: Response,
    next: NextFunction
) {
    if (!isCollectionsProfile(req.workspaceProfile)) {
        const target = req.originalUrl.startsWith("/agent")
            ? "/agent/dashboard"
            : "/admin/dashboard";

        return res.redirect(`${target}?error=cobranza_desactivada`);
    }

    return next();
}
