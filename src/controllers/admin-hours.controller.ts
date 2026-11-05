import { LogLevel, LogModule, OffHoursMode } from "@prisma/client";
import { Request, Response } from "express";

import { prisma } from "../config/prisma";
import { LogService } from "../services/log.service";
import { hoursSchema } from "../validations/hours.validation";

const WEEKDAY_LABELS: Record<number, string> = {
    0: "Domingo",
    1: "Lunes",
    2: "Martes",
    3: "Miércoles",
    4: "Jueves",
    5: "Viernes",
    6: "Sábado"
};

type HoursForm = {
    businessHoursEnabled: boolean;
    timezone: string;
    days: number[];
    start: string;
    end: string;
    mode: OffHoursMode;
    message: string;
    intervalHours: number;
};

function formFromWorkspace(workspace: {
    businessHoursEnabled: boolean;
    businessHours: unknown;
    offHoursMode: OffHoursMode;
    offHoursMessage: string | null;
    offHoursReplyIntervalHours: number;
    settings: { timezone: string } | null;
}): HoursForm {
    const raw = (workspace.businessHours ?? {}) as Record<string, unknown>;

    return {
        businessHoursEnabled: workspace.businessHoursEnabled,
        timezone:
            typeof raw.timezone === "string"
                ? raw.timezone
                : workspace.settings?.timezone || "America/Mexico_City",
        days: Array.isArray(raw.days) ? raw.days.map(Number) : [1, 2, 3, 4, 5],
        start: typeof raw.start === "string" ? raw.start : "09:00",
        end: typeof raw.end === "string" ? raw.end : "18:00",
        mode: workspace.offHoursMode,
        message: workspace.offHoursMessage ?? "",
        intervalHours: workspace.offHoursReplyIntervalHours
    };
}

export class AdminHoursController {
    static async index(req: Request, res: Response) {
        const workspace = await prisma.workspace.findUniqueOrThrow({
            where: { id: req.user!.workspaceId },
            select: {
                businessHoursEnabled: true,
                businessHours: true,
                offHoursMode: true,
                offHoursMessage: true,
                offHoursReplyIntervalHours: true,
                settings: { select: { timezone: true } }
            }
        });

        return res.render("pages/admin/hours/index", {
            user: req.user,
            form: formFromWorkspace(workspace),
            weekdayLabels: WEEKDAY_LABELS,
            modes: [
                OffHoursMode.TEXT_ONLY,
                OffHoursMode.AI_IF_COVERED,
                OffHoursMode.QUEUE_ONLY
            ],
            modeLabels: {
                TEXT_ONLY: "Solo mensaje de fuera de horario",
                AI_IF_COVERED: "IA si la base cubre la pregunta",
                QUEUE_ONLY: "Solo encolar, sin responder"
            },
            success: req.query.success || null,
            error: req.query.error || null
        });
    }

    static async save(req: Request, res: Response) {
        const parsed = hoursSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.redirect("/admin/hours?error=invalid");
        }

        const input = parsed.data;
        const days = input.days.length > 0 ? input.days : [1, 2, 3, 4, 5];

        try {
            await prisma.workspace.update({
                where: { id: req.user!.workspaceId },
                data: {
                    businessHoursEnabled: input.businessHoursEnabled,
                    businessHours: {
                        timezone: input.timezone,
                        days,
                        start: input.start,
                        end: input.end
                    },
                    offHoursMode: input.mode,
                    offHoursMessage: input.message || null,
                    offHoursReplyIntervalHours: input.intervalHours
                }
            });

            await LogService.create({
                workspaceId: req.user!.workspaceId,
                level: LogLevel.INFO,
                module: LogModule.SYSTEM,
                action: "WORKSPACE_BUSINESS_HOURS_CHANGED",
                message: "Se actualizó el horario de atención y el modo fuera de horario.",
                payload: {
                    enabled: input.businessHoursEnabled,
                    timezone: input.timezone,
                    days,
                    start: input.start,
                    end: input.end,
                    mode: input.mode,
                    intervalHours: input.intervalHours
                }
            }).catch(() => undefined);
        } catch {
            return res.redirect("/admin/hours?error=save");
        }

        return res.redirect("/admin/hours?success=saved");
    }
}
