import { Request, Response } from "express";

import { ContactService } from "../services/contact.service";
import { ContactOutcomeService } from "../services/contact-outcome.service";
import { SendPolicyService } from "../services/send-policy.service";
import { formatDateTimeMX, startOfTodayIn } from "../utils/date";
import {
    OUTCOME_BADGE_CLASSES,
    OUTCOME_LABELS,
    OUTCOME_SHORT_LABELS,
    OUTCOME_TYPES,
    daysOverdue,
    formatAmount,
    isOpenPromise,
    parseAmount
} from "../utils/outcome";
import { TagService } from "../services/tag.service";
import { getRequiredParam } from "../utils/request";
import {
    createContactSchema,
    updateContactSchema
} from "../validations/contact.validation";

export class AdminContactsController {
    static async index(req: Request, res: Response) {
        const search =
            typeof req.query.search === "string" ? req.query.search : "";

        const tagId =
            typeof req.query.tagId === "string" ? req.query.tagId : "";

        const onlyOptedOut = req.query.bajas === "1";
        const outcomeType =
            typeof req.query.resultado === "string" &&
            req.query.resultado !== ""
                ? req.query.resultado
                : undefined;
        const overdueOnly = req.query.vencidas === "1";
        const withoutOutcomeOnly = req.query.sinResultado === "1";
        const neverAnsweredOnly = req.query.nuncaRespondio === "1";
        const minAttempts = Number(req.query.intentos) > 0
            ? Number(req.query.intentos)
            : undefined;

        const [contacts, tags] = await Promise.all([
            ContactService.listContacts({
                workspaceId: req.user!.workspaceId,
                search,
                tagId: tagId || undefined,
                onlyOptedOut,
                outcomeType,
                overdueOnly,
                withoutOutcomeOnly,
                minAttempts,
                neverAnsweredOnly
            }),
            TagService.listTags(req.user!.workspaceId)
        ]);

        /**
         * Intentos y atraso se calculan al vuelo: los intentos con los
         * mensajes, el atraso con la fecha compromiso. Nada de esto se
         * guarda, así que no puede quedar desactualizado.
         */
        const timezone = await SendPolicyService.timezoneFor(
            req.user!.workspaceId
        );
        const todayStart = startOfTodayIn(timezone);
        const attempts = await ContactOutcomeService.attemptsFor(
            req.user!.workspaceId,
            contacts.map((contact) => contact.id)
        );

        return res.render("pages/admin/contacts/index", {
            user: req.user,
            contacts,
            tags,
            search,
            tagId,
            onlyOptedOut,
            outcomeType: outcomeType || "",
            overdueOnly,
            withoutOutcomeOnly,
            neverAnsweredOnly,
            minAttempts: minAttempts || "",
            attempts,
            outcomeLabels: OUTCOME_LABELS,
            outcomeBadgeClasses: OUTCOME_BADGE_CLASSES,
            outcomeTypes: OUTCOME_TYPES,
            formatAmount,
            daysLate: (contact: { outcomeDueAt: Date | null }) =>
                daysOverdue(contact.outcomeDueAt, todayStart),
            success: req.query.success || null,
            error: req.query.error || null
        });
    }

    static async showCreate(req: Request, res: Response) {
        const tags = await TagService.listTags(req.user!.workspaceId);

        return res.render("pages/admin/contacts/create", {
            user: req.user,
            tags,
            error: null,
            old: {
                customName: "",
                phone: "",
                notes: "",
                tagIds: []
            }
        });
    }

    static async create(req: Request, res: Response) {
        const parsed = createContactSchema.safeParse(req.body);

        if (!parsed.success) {
            const tags = await TagService.listTags(req.user!.workspaceId);

            return res.status(400).render("pages/admin/contacts/create", {
                user: req.user,
                tags,
                error: parsed.error.issues[0]?.message || "Datos inválidos.",
                old: {
                    customName: req.body.customName || "",
                    phone: req.body.phone || "",
                    notes: req.body.notes || "",
                    tagIds: Array.isArray(req.body.tagIds)
                        ? req.body.tagIds
                        : req.body.tagIds
                          ? [req.body.tagIds]
                          : []
                }
            });
        }

        try {
            await ContactService.createContact(
                req.user!.workspaceId,
                parsed.data
            );

            return res.redirect("/admin/contacts?success=created");
        } catch (error) {
            const tags = await TagService.listTags(req.user!.workspaceId);

            const message =
                error instanceof Error
                    ? error.message
                    : "No se pudo crear el contacto.";

            return res.status(400).render("pages/admin/contacts/create", {
                user: req.user,
                tags,
                error: message,
                old: {
                    customName: req.body.customName || "",
                    phone: req.body.phone || "",
                    notes: req.body.notes || "",
                    tagIds: Array.isArray(req.body.tagIds)
                        ? req.body.tagIds
                        : req.body.tagIds
                          ? [req.body.tagIds]
                          : []
                }
            });
        }
    }

    static async showEdit(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            const [contact, tags] = await Promise.all([
                ContactService.getContactById(req.user!.workspaceId, id),
                TagService.listTags(req.user!.workspaceId)
            ]);

            const [history, attemptsMap] = await Promise.all([
                ContactOutcomeService.historyFor(req.user!.workspaceId, id),
                ContactOutcomeService.attemptsFor(req.user!.workspaceId, [id])
            ]);

            const timezone = await SendPolicyService.timezoneFor(
                req.user!.workspaceId
            );

            return res.render("pages/admin/contacts/edit", {
                user: req.user,
                contact,
                tags,
                history,
                attempts: attemptsMap.get(id) ?? {
                    attempts: 0,
                    hasInbound: false,
                    lastInboundAt: null
                },
                outcomeLabels: OUTCOME_LABELS,
                outcomeBadgeClasses: OUTCOME_BADGE_CLASSES,
                outcomeTypes: OUTCOME_TYPES,
                shortLabels: OUTCOME_SHORT_LABELS,
                isOpenPromise,
                daysLate: daysOverdue(
                    contact.outcomeDueAt,
                    startOfTodayIn(timezone)
                ),
                formatAmount,
                formatDateTimeMX,
                error: req.query.error || null,
                success: req.query.success || null
            });
        } catch {
            return res.redirect("/admin/contacts");
        }
    }

    static async update(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        const parsed = updateContactSchema.safeParse(req.body);

        if (!parsed.success) {
            const [contact, tags] = await Promise.all([
                ContactService.getContactById(req.user!.workspaceId, id),
                TagService.listTags(req.user!.workspaceId)
            ]);

            return res.status(400).render("pages/admin/contacts/edit", {
                user: req.user,
                contact,
                tags,
                error: parsed.error.issues[0]?.message || "Datos inválidos."
            });
        }

        try {
            await ContactService.updateContact(
                req.user!.workspaceId,
                id,
                parsed.data
            );

            return res.redirect("/admin/contacts?success=updated");
        } catch {
            return res.redirect("/admin/contacts");
        }
    }

    static async deactivate(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            await ContactService.deactivateContact(req.user!.workspaceId, id);
        } catch {
            // Por ahora no detenemos la vista.
        }

        return res.redirect("/admin/contacts?success=deactivated");
    }

    /**
     * El destino de la redirección se valida para que solo pueda ser una
     * ruta interna: aceptar una URL completa sería un redirect abierto.
     */
    private static safeRedirect(req: Request, fallback: string): string {
        const raw =
            typeof req.body?.redirectTo === "string"
                ? req.body.redirectTo
                : typeof req.query?.redirectTo === "string"
                  ? req.query.redirectTo
                  : "";

        return raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
    }

    static async optOut(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            await ContactService.setOptOut(
                req.user!.workspaceId,
                id,
                "admin"
            );
        } catch {
            return res.redirect(
                AdminContactsController.safeRedirect(
                    req,
                    "/admin/contacts?error=opt-out"
                )
            );
        }

        return res.redirect(
            AdminContactsController.safeRedirect(
                req,
                "/admin/contacts?success=opted-out"
            )
        );
    }

    static async optIn(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            await ContactService.setOptIn(req.user!.workspaceId, id);
        } catch {
            return res.redirect(
                AdminContactsController.safeRedirect(
                    req,
                    "/admin/contacts?error=opt-in"
                )
            );
        }

        return res.redirect(
            AdminContactsController.safeRedirect(
                req,
                "/admin/contacts?success=opted-in"
            )
        );
    }
}
