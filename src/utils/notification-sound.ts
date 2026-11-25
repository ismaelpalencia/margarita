export const NOTIFICATION_SOUND_TYPES = [
    "classic",
    "gentle",
    "bell",
    "double",
    "chime",
    "drop",
    "marimba",
    "pulse"
] as const;

export type NotificationSoundType = typeof NOTIFICATION_SOUND_TYPES[number];

export function isNotificationSoundType(value: unknown): value is NotificationSoundType {
    return typeof value === "string" && NOTIFICATION_SOUND_TYPES.includes(value as NotificationSoundType);
}
