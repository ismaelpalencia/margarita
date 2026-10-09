export function isConversationWindowOpen(lastIncomingMessageAt: Date | null): boolean {
    if (!lastIncomingMessageAt) {
        return false;
    }

    const now = new Date();

    const diffMs = now.getTime() - lastIncomingMessageAt.getTime();

    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    return diffMs <= twentyFourHoursMs;
}

export function getConversationWindowExpiresAt(
    lastIncomingMessageAt: Date | null
): Date | null {
    if (!lastIncomingMessageAt) {
        return null;
    }

    const expiresAt = new Date(lastIncomingMessageAt);

    expiresAt.setHours(expiresAt.getHours() + 24);

    return expiresAt;
}
