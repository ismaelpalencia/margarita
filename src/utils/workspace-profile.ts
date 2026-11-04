import { WorkspaceProfile } from "@prisma/client";

/**
 * Giro de la operación.
 *
 * El código es el mismo para todos los giros: lo que cambia es el vocabulario
 * y qué módulos se muestran. Cobranza es el único perfil que enciende el
 * módulo de resultados, promesas, montos, reportes y botones; los demás usan
 * la plataforma como bandeja de WhatsApp, campañas y contactos.
 *
 * El perfil vive en `Workspace.profile` desde la migración de la fase 1 de IA,
 * así que cambiarlo no borra ni migra datos: solo apaga o enciende pantallas.
 */
export const WORKSPACE_PROFILES = [
    WorkspaceProfile.COBRANZA,
    WorkspaceProfile.COMERCIO,
    WorkspaceProfile.SERVICIOS,
    WorkspaceProfile.GENERICO
] as const;

export const WORKSPACE_PROFILE_LABELS: Record<WorkspaceProfile, string> = {
    COBRANZA: "Cobranza",
    COMERCIO: "Comercio",
    SERVICIOS: "Servicios",
    GENERICO: "Genérico"
};

export const WORKSPACE_PROFILE_DESCRIPTIONS: Record<WorkspaceProfile, string> = {
    COBRANZA:
        "Resultados de gestión, promesas, montos, reportes y respuestas de botón.",
    COMERCIO:
        "Pedidos, horarios y atención comercial. Sin módulo de cobranza.",
    SERVICIOS:
        "Citas, cotizaciones y seguimiento de servicios. Sin módulo de cobranza.",
    GENERICO:
        "Bandeja, campañas y contactos sin un giro definido. Sin módulo de cobranza."
};

/** El módulo de cobranza solo se enciende con el perfil COBRANZA. */
export function isCollectionsProfile(
    profile: WorkspaceProfile | string | null | undefined
): boolean {
    return profile === WorkspaceProfile.COBRANZA;
}

export function isWorkspaceProfile(
    value: unknown
): value is WorkspaceProfile {
    return (
        typeof value === "string" &&
        (WORKSPACE_PROFILES as readonly string[]).includes(value)
    );
}

/**
 * Lee el giro que llega de un formulario. Devuelve `null` si el valor no es
 * uno de los perfiles conocidos, para que el controlador responda con un
 * error en lugar de guardar algo inesperado.
 */
export function parseWorkspaceProfile(
    value: unknown
): WorkspaceProfile | null {
    return isWorkspaceProfile(value) ? value : null;
}

export type WorkspaceModules = {
    /** Resultados, promesas, montos, reportes y botones. */
    collections: boolean;
};

export function modulesForProfile(
    profile: WorkspaceProfile | string | null | undefined
): WorkspaceModules {
    return {
        collections: isCollectionsProfile(profile)
    };
}
