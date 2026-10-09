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
