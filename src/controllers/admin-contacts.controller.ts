import { Request, Response } from "express";

import { ContactService } from "../services/contact.service";
import { ContactOutcomeService } from "../services/contact-outcome.service";
import { SendPolicyService } from "../services/send-policy.service";
import { startOfTodayIn } from "../utils/date";
import {
    OUTCOME_LABELS,
    OUTCOME_TYPES,
    daysOverdue
} from "../utils/outcome";
import { TagService } from "../services/tag.service";
import { getRequiredParam } from "../utils/request";
import {
    createContactSchema,
    updateContactSchema
} from "../validations/contact.validation";

export class AdminContactsController {
    private static wantsJson(req: Request): boolean {
        return Boolean(req.accepts("json") && !req.accepts("html"));
    }

    static async index(req: Request, res: Response) {
        if (!(req.accepts("json") && !req.accepts("html"))) {
            const query = req.originalUrl.includes("?")
                ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
                : "";
            return res.redirect(`/panel/admin/contacts${query}`);
        }

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

        return res.json({
            contacts: contacts.map((contact) => ({
                id: contact.id,
                customName: contact.customName,
                phone: contact.phone,
                optOutAt: contact.optOutAt,
                outcomeType: contact.outcomeType,
                outcomeDueAt: contact.outcomeDueAt,
                tags: contact.tags.map((item) => ({
                    tag: {
                        id: item.tag.id,
                        name: item.tag.name,
                        color: item.tag.color
                    }
                })),
                attempts: attempts.get(contact.id) ?? {
                    attempts: 0,
                    hasInbound: false,
                    lastInboundAt: null
                },
                daysLate: daysOverdue(contact.outcomeDueAt, todayStart)
            })),
            tags: tags.map(({ id, name, color }) => ({ id, name, color })),
            filters: {
                search,
                tagId,
                onlyOptedOut,
                outcomeType: outcomeType || "",
                overdueOnly,
                withoutOutcomeOnly,
                neverAnsweredOnly,
                minAttempts: minAttempts || ""
            }
        });

    }

    static async showCreate(req: Request, res: Response) {
        if (!(req.accepts("json") && !req.accepts("html"))) {
            return res.redirect("/panel/admin/contacts/new");
        }
        const tags = await TagService.listTags(req.user!.workspaceId);
        return res.json({ tags: tags.map(({ id, name, color }) => ({ id, name, color })) });
    }

    static async create(req: Request, res: Response) {
        const parsed = createContactSchema.safeParse(req.body);

        if (!parsed.success) {
            if (req.is("application/json")) {
                return res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos." });
            }
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

            if (req.is("application/json")) return res.status(201).json({ ok: true });

            return res.redirect("/admin/contacts?success=created");
        } catch (error) {
            if (req.is("application/json")) {
                const message = error instanceof Error ? error.message : "No se pudo crear el contacto.";
                return res.status(400).json({ error: message });
            }
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

        const wantsJson = req.accepts("json") && !req.accepts("html");
        if (!wantsJson) return res.redirect(`/panel/admin/contacts/${id}`);

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

            return res.json({
                contact: {
                    id: contact.id,
                    customName: contact.customName,
                    profileName: contact.profileName,
                    phone: contact.phone,
                    notes: contact.notes,
                    optOutAt: contact.optOutAt,
                    optOutSource: contact.optOutSource,
                    optInAt: contact.optInAt,
                    optInSource: contact.optInSource,
                    optInRecordedBy: contact.optInRecordedBy,
                    pausedAt: contact.pausedAt,
                    pausedReason: contact.pausedReason,
                    outcomeType: contact.outcomeType,
                    outcomeAmount: contact.outcomeAmount,
                    outcomeDueAt: contact.outcomeDueAt,
                    outcomePaidAt: contact.outcomePaidAt,
                    tags: contact.tags.map((item) => ({
                        tagId: item.tagId,
                        tag: { id: item.tag.id, name: item.tag.name, color: item.tag.color }
                    }))
                },
                tags: tags.map(({ id, name, color }) => ({ id, name, color })),
                history: history.map(({ id, type, amount, dueAt, paidAt, note, userName, source, createdAt }) => ({
                    id, type, amount, dueAt, paidAt, note, userName, source, createdAt
                })),
                attempts: attemptsMap.get(id) ?? {
                    attempts: 0,
                    hasInbound: false,
                    lastInboundAt: null
                },
                outcomeTypes: OUTCOME_TYPES,
                outcomeLabels: OUTCOME_LABELS,
                daysLate: daysOverdue(
                    contact.outcomeDueAt,
                    startOfTodayIn(timezone)
                ),
                collectionsEnabled: req.workspaceProfile === "COBRANZA"
            });
        } catch {
            if (wantsJson) return res.status(404).json({ error: "No se encontró el contacto." });
            return res.redirect("/admin/contacts");
        }
    }

    static async update(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        const parsed = updateContactSchema.safeParse(req.body);

        if (!parsed.success) {
            if (req.is("application/json")) {
                return res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos." });
            }
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

            if (req.is("application/json")) return res.json({ ok: true });

            return res.redirect("/admin/contacts?success=updated");
        } catch (error) {
            if (req.is("application/json")) {
                return res.status(400).json({ error: error instanceof Error ? error.message : "No se pudo actualizar el contacto." });
            }
            return res.redirect("/admin/contacts");
        }
    }

    static async removePermanently(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");
        const confirmation = typeof req.body?.confirm === "string" ? req.body.confirm.trim().toUpperCase() : "";
        if (confirmation !== "BORRAR") {
            return res.redirect(`/admin/contacts/${id}?error=confirm`);
        }
        try {
            await ContactService.deleteContactPermanently(req.user!.workspaceId, id);
            return res.redirect("/panel/admin/contacts?success=deleted");
        } catch {
            return res.redirect(`/admin/contacts/${id}?error=delete`);
        }
    }

    static async deactivate(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            await ContactService.deactivateContact(req.user!.workspaceId, id);
        } catch {
            if (AdminContactsController.wantsJson(req)) return res.status(400).json({ error: "No se pudo archivar el contacto." });
            // Por ahora no detenemos la vista.
        }

        if (AdminContactsController.wantsJson(req)) return res.json({ ok: true });

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
            if (AdminContactsController.wantsJson(req)) return res.status(400).json({ error: "No se pudo registrar la baja." });
            return res.redirect(
                AdminContactsController.safeRedirect(
                    req,
                    "/admin/contacts?error=opt-out"
                )
            );
        }

        if (AdminContactsController.wantsJson(req)) return res.json({ ok: true });

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
            await ContactService.setOptIn(req.user!.workspaceId, id, {
                source:
                    typeof req.body?.source === "string" ? req.body.source : null,
                userId: req.user!.id
            });
        } catch {
            if (AdminContactsController.wantsJson(req)) return res.status(400).json({ error: "No se pudo registrar el consentimiento." });
            return res.redirect(
                AdminContactsController.safeRedirect(
                    req,
                    "/admin/contacts?error=opt-in"
                )
            );
        }

        if (AdminContactsController.wantsJson(req)) return res.json({ ok: true });

        return res.redirect(
            AdminContactsController.safeRedirect(
                req,
                "/admin/contacts?success=opted-in"
            )
        );
    }

    /**
     * Pausa la cuenta del contacto: se deja de escribirle hasta que alguien la
     * quite. Es lo que dispara sola la regla de «no reconozco la deuda», y a
     * mano sirve para casos a medio revisar.
     */
    static async pause(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        const reason =
            typeof req.body?.reason === "string" && req.body.reason.trim() !== ""
                ? req.body.reason.trim()
                : "Pausada a mano desde la ficha del contacto.";

        try {
            await ContactService.setPause(req.user!.workspaceId, id, reason);
        } catch {
            if (AdminContactsController.wantsJson(req)) return res.status(400).json({ error: "No se pudo poner en pausa." });
            return res.redirect(
                AdminContactsController.safeRedirect(
                    req,
                    "/admin/contacts?error=pause"
                )
            );
        }

        if (AdminContactsController.wantsJson(req)) return res.json({ ok: true });

        return res.redirect(
            AdminContactsController.safeRedirect(
                req,
                "/admin/contacts?success=paused"
            )
        );
    }

    static async resume(req: Request, res: Response) {
        const id = getRequiredParam(req, "id");

        try {
            await ContactService.clearPause(req.user!.workspaceId, id);
        } catch {
            if (AdminContactsController.wantsJson(req)) return res.status(400).json({ error: "No se pudo quitar la pausa." });
            return res.redirect(
                AdminContactsController.safeRedirect(
                    req,
                    "/admin/contacts?error=resume"
                )
            );
        }

        if (AdminContactsController.wantsJson(req)) return res.json({ ok: true });

        return res.redirect(
            AdminContactsController.safeRedirect(
                req,
                "/admin/contacts?success=resumed"
            )
        );
    }
}
