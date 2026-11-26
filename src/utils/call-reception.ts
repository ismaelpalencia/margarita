import { BusinessHours, isWithinBusinessHours, parseBusinessHours } from "./business-hours";

export type CallReceptionDecision = { allowed: boolean; reason?: "manual" | "outside_hours" };

export function decideCallReception(input: {
    enabled: boolean;
    autoRejectOutsideHours: boolean;
    businessHoursEnabled: boolean;
    businessHours: unknown;
    now?: Date;
}): CallReceptionDecision {
    if (!input.enabled) return { allowed: false, reason: "manual" };
    if (!input.autoRejectOutsideHours || !input.businessHoursEnabled) return { allowed: true };
    const hours: BusinessHours | null = parseBusinessHours(input.businessHours);
    if (!isWithinBusinessHours(hours, input.now || new Date())) return { allowed: false, reason: "outside_hours" };
    return { allowed: true };
}
