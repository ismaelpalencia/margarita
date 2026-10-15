export function getSessionExpiresAt(): Date {
    const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

    const match = expiresIn.match(/^(\d+)([dhm])$/);

    if (!match) {
        const date = new Date();
        date.setDate(date.getDate() + 7);
        return date;
    }

    const amount = Number(match[1]);
    const unit = match[2];

    const date = new Date();

    if (unit === "d") {
        date.setDate(date.getDate() + amount);
    }

    if (unit === "h") {
        date.setHours(date.getHours() + amount);
    }

    if (unit === "m") {
        date.setMinutes(date.getMinutes() + amount);
    }

    return date;
}

/**
 * ¿La sesión lleva demasiado tiempo sin usarse? Se toma la última actividad
 * y, si nunca hubo, la fecha de creación.
 *
 * Vive aquí, y no en el servicio, para poder probarla sin base de datos.
 */
export function isSessionIdle(
    session: { lastSeenAt: Date | null; createdAt: Date },
    idleLimitMs: number,
    now = new Date()
): boolean {
    const reference = session.lastSeenAt ?? session.createdAt;

    return now.getTime() - reference.getTime() > idleLimitMs;
}
