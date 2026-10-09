import { Request, Response } from "express";

import { ContactService } from "../services/contact.service";
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

        const [contacts, tags] = await Promise.all([
            ContactService.listContacts({
                workspaceId: req.user!.workspaceId,
                search,
                tagId: tagId || undefined
            }),
            TagService.listTags(req.user!.workspaceId)
        ]);

        return res.render("pages/admin/contacts/index", {
            user: req.user,
            contacts,
            tags,
            search,
            tagId,
            success: req.query.success || null
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

            return res.render("pages/admin/contacts/edit", {
                user: req.user,
                contact,
                tags,
                error: null
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
}