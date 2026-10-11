/**
 * Traducciones de los avisos que Meta envía por webhook, fuera de los
 * mensajes: cambios de estado de plantillas y de calidad de los números.
 */

/** Evento del webhook `message_template_status_update`. */
export function mapTemplateEvent(event: string | null | undefined): {
    status: string;
    critical: boolean;
    description: string;
} | null {
    switch (String(event || "").toUpperCase()) {
        case "APPROVED":
        case "REINSTATED":
            return {
                status: "APPROVED",
                critical: false,
                description: "La plantilla fue aprobada por Meta."
            };
        case "REJECTED":
            return {
                status: "REJECTED",
                critical: true,
                description:
                    "Meta rechazó la plantilla. No se puede usar hasta corregirla."
            };
        case "PAUSED":
            return {
                status: "PAUSED",
                critical: true,
                description:
                    "Meta pausó la plantilla por su calidad. Conviene revisar los envíos recientes."
            };
        case "DISABLED":
            return {
                status: "DISABLED",
                critical: true,
                description: "Meta deshabilitó la plantilla."
            };
        case "FLAGGED":
            return {
                status: "FLAGGED",
                critical: true,
                description:
                    "Meta marcó la plantilla. Revisa su contenido antes de seguir enviándola."
            };
        case "DELETED":
            return {
                status: "DELETED",
                critical: true,
                description: "La plantilla fue eliminada."
            };
        case "PENDING":
        case "PENDING_DELETION":
        case "IN_APPEAL":
            return {
                status: "PENDING",
                critical: false,
                description: "La plantilla sigue en revisión por Meta."
            };
        default:
            return null;
    }
}

/** Evento del webhook `phone_number_quality_update`. */
export function mapQualityEvent(event: string | null | undefined): {
    status: string;
    critical: boolean;
    description: string;
} | null {
    switch (String(event || "").toUpperCase()) {
        case "FLAGGED":
            return {
                status: "FLAGGED",
                critical: true,
                description:
                    "Meta marcó la calidad de este número. Puede limitar tus envíos; revisa qué mensajes lo provocaron."
            };
        case "UNFLAGGED":
            return {
                status: "CONNECTED",
                critical: false,
                description: "La calidad del número volvió a la normalidad."
            };
        default:
            return null;
    }
}

/** Texto del motivo que Meta adjunta a algunos eventos. */
export function describeReason(reason: unknown): string | null {
    if (typeof reason !== "string" || reason.trim() === "") {
        return null;
    }

    return reason.trim();
}
