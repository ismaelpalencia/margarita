import { Request, Response } from "express";
import { ContactOutcomeType } from "@prisma/client";

import { ReportService } from "../services/report.service";
import { ContactOutcomeService } from "../services/contact-outcome.service";
import { UserService } from "../services/user.service";
import { TagService } from "../services/tag.service";
import { prisma } from "../config/prisma";
import { toCsv, CsvCell } from "../utils/csv";
import { formatDateTimeMX } from "../utils/date";
import {
    OUTCOME_LABELS,
    OUTCOME_TYPES
} from "../utils/outcome";

const VIEWS = [
    "hoy",
    "gestiones",
    "promesas",
    "intentos",
    "tendencias",
    "detalle"
] as const;

type ReportView = (typeof VIEWS)[number];

function readFilters(req: Request, range: {
    from: Date;
    to: Date;
    fromLabel: string;
    toLabel: string;
}) {
    const text = (name: string) =>
        typeof req.query[name] === "string" ? String(req.query[name]) : "";

    return {
        workspaceId: req.user!.workspaceId,
        from: range.from,
        to: range.to,
        fromLabel: range.fromLabel,
        toLabel: range.toLabel,
        userId: text("userId") || undefined,
        campaignId: text("campaignId") || undefined,
        tagId: text("tagId") || undefined
    };
}

export class AdminReportsController {
    private static view(req: Request): ReportView {
        const value = typeof req.query.vista === "string" ? req.query.vista : "";

        return (VIEWS as readonly string[]).includes(value)
            ? (value as ReportView)
            : "gestiones";
    }

    private static async context(req: Request) {
        const range = await ReportService.resolveRange(
            req.user!.workspaceId,
            typeof req.query.from === "string" ? req.query.from : undefined,
            typeof req.query.to === "string" ? req.query.to : undefined
        );

        const [agents, tags, campaigns, numbers] = await Promise.all([
            UserService.listAgents(req.user!.workspaceId),
            TagService.listTags(req.user!.workspaceId),
            prisma.campaign.findMany({
                where: { workspaceId: req.user!.workspaceId },
                select: { id: true, name: true },
                orderBy: { createdAt: "desc" },
                take: 100
            }),
            prisma.whatsAppNumber.findMany({
                where: {
                    whatsappAccount: { workspaceId: req.user!.workspaceId }
                },
                select: { id: true, displayName: true, phoneNumber: true }
            })
        ]);

        return { range, agents, tags, campaigns, numbers };
    }

    static async index(req: Request, res: Response) {
        /**
         * Se llama por el nombre de la clase y no con `this`: Express invoca
         * el handler suelto, así que `this` es `undefined` dentro del método.
         */
        const view = AdminReportsController.view(req);
        const { range, agents, tags, campaigns, numbers } =
            await AdminReportsController.context(req);

        const filters = readFilters(req, range);

        const [summary, gestiones, promises, compliance, noAnswer, worklist, trends] =
            await Promise.all([
                ReportService.outcomeSummary(req.user!.workspaceId),
                view === "gestiones" || view === "detalle"
                    ? ReportService.gestiones(filters, range.timezone)
                    : null,
                view === "promesas"
                    ? ReportService.pendingPromises(
                          req.user!.workspaceId,
                          range.todayStart
                      )
                    : null,
                view === "promesas"
                    ? ReportService.promiseCompliance(filters)
                    : null,
                view === "intentos"
                    ? ReportService.noAnswerCandidates(
                          req.user!.workspaceId,
                          ReportService.defaultThreshold()
                      )
                    : null,
                view === "hoy"
                    ? ReportService.todayWorklist(
                          req.user!.workspaceId,
                          range.todayStart,
                          ReportService.defaultThreshold()
                      )
                    : null,
                view === "tendencias"
                    ? ReportService.trends(filters, range.timezone)
                    : null
            ]);

        return res.render("pages/admin/reports/index", {
            user: req.user,
            view,
            summary,
            gestiones,
            promises,
            compliance,
            noAnswer,
            worklist,
            trends,
            threshold: ReportService.defaultThreshold(),
            agents,
            tags,
            campaigns,
            numbers,
            outcomeLabels: OUTCOME_LABELS,
            outcomeTypes: OUTCOME_TYPES,
            filters: {
                from: range.fromLabel,
                to: range.toLabel,
                userId:
                    typeof req.query.userId === "string" ? req.query.userId : "",
                campaignId:
                    typeof req.query.campaignId === "string"
                        ? req.query.campaignId
                        : "",
                tagId:
                    typeof req.query.tagId === "string" ? req.query.tagId : ""
            },
            formatDateTimeMX,
            formatAmount: ReportService.formatAmount,
            today: range.todayStart
        });
    }

    /** Descarga en CSV de la vista que se está viendo, con los mismos filtros. */
    static async export(req: Request, res: Response) {
        const view = AdminReportsController.view(req);
        const { range } = await AdminReportsController.context(req);
        const filters = readFilters(req, range);

        let rows: Array<Record<string, CsvCell>> = [];
        let columns: string[] = [];
        let filename = "reporte";

        if (view === "detalle" || view === "gestiones") {
            const detail = await ReportService.detailRows(filters);

            filename = `gestiones-${range.fromLabel}-a-${range.toLabel}`;
            columns = [
                "fecha",
                "contacto",
                "telefono",
                "resultado",
                "monto",
                "fecha_compromiso",
                "fecha_pago",
                "nota",
                "registro",
                "usuario"
            ];
            rows = detail.map((row) => ({
                fecha: formatDateTimeMX(row.createdAt),
                contacto: row.contactName,
                telefono: row.contactPhone,
                resultado: OUTCOME_LABELS[row.type],
                monto: row.amount ?? "",
                fecha_compromiso: row.dueAt
                    ? formatDateTimeMX(row.dueAt)
                    : "",
                fecha_pago: row.paidAt ? formatDateTimeMX(row.paidAt) : "",
                nota: row.note ?? "",
                registro: row.source === "BULK" ? "En bloque" : "En el hilo",
                usuario: row.userName ?? ""
            }));
        }

        if (view === "promesas") {
            const pending = await ReportService.pendingPromises(
                req.user!.workspaceId,
                range.todayStart
            );

            filename = `promesas-${range.toLabel}`;
            columns = [
                "contacto",
                "telefono",
                "resultado",
                "monto",
                "fecha_compromiso",
                "dias_de_atraso",
                "registro",
                "usuario"
            ];
            rows = pending.items.map((item) => ({
                contacto: item.contactName,
                telefono: item.contactPhone,
                resultado: OUTCOME_LABELS[item.type],
                monto: item.amount ?? "",
                fecha_compromiso: formatDateTimeMX(item.dueAt),
                dias_de_atraso: item.daysLate,
                registro: item.outcomeAt
                    ? formatDateTimeMX(item.outcomeAt)
                    : "",
                usuario: item.userName ?? ""
            }));
        }

        if (view === "intentos") {
            const candidates = await ReportService.noAnswerCandidates(
                req.user!.workspaceId,
                ReportService.defaultThreshold()
            );

            filename = `sin-contestacion-${range.toLabel}`;
            columns = [
                "contacto",
                "telefono",
                "intentos_sin_respuesta",
                "ha_respondido_alguna_vez",
                "resultado_actual"
            ];
            rows = candidates.map((item) => ({
                contacto: item.name,
                telefono: item.phone,
                intentos_sin_respuesta: item.attempts,
                ha_respondido_alguna_vez: item.hasInbound ? "sí" : "no",
                resultado_actual: item.outcomeType
                    ? OUTCOME_LABELS[item.outcomeType]
                    : "sin resultado"
            }));
        }

        const csv = toCsv(rows, columns);

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${filename}.csv"`
        );

        return res.send(csv);
    }

    /**
     * Marca el resultado desde la lista de candidatos: es el atajo de
     * "reviso la lista y despacho".
     */
    static async markNoAnswer(req: Request, res: Response) {
        const ids =
            typeof req.body?.contactIds === "string"
                ? [req.body.contactIds]
                : Array.isArray(req.body?.contactIds)
                  ? req.body.contactIds
                  : [];

        try {
            await ContactOutcomeService.mark({
                workspaceId: req.user!.workspaceId,
                contactIds: ids,
                userId: req.user!.id,
                type: ContactOutcomeType.NO_ANSWER,
                note: "Marcado desde el reporte de intentos.",
                source: "BULK"
            });
        } catch {
            return res.redirect("/admin/reports?vista=intentos&error=mark");
        }

        return res.redirect("/admin/reports?vista=intentos&success=marked");
    }
}
