import { Prisma } from "@prisma/client";
import { MetaWebhookMessage } from "../types/meta-webhook";

type SharedContact = NonNullable<MetaWebhookMessage["contacts"]>[number];

export function formatSharedContacts(contacts: SharedContact[] | undefined): string {
    if (!contacts?.length) return "[Tarjeta de contacto]";

    return contacts.map((contact, index) => {
        const name = contact.name;
        const fullName = name?.formatted_name || [
            name?.prefix,
            name?.first_name,
            name?.middle_name,
            name?.last_name,
            name?.suffix
        ].filter(Boolean).join(" ");
        const lines: string[] = [];

        if (contacts.length > 1) lines.push(`Contacto ${index + 1}`);
        if (fullName) lines.push(`Nombre: ${fullName}`);
        if (contact.org?.company) lines.push(`Empresa: ${contact.org.company}`);
        if (contact.org?.department) lines.push(`Área: ${contact.org.department}`);
        if (contact.org?.title) lines.push(`Puesto: ${contact.org.title}`);
        contact.phones?.forEach((phone, phoneIndex) => {
            const value = phone.phone || phone.wa_id;
            if (value) lines.push(`${phoneIndex === 0 ? "Teléfono" : `Teléfono ${phoneIndex + 1}`}: ${value}${phone.type ? ` (${phone.type})` : ""}`);
        });
        contact.emails?.forEach((item, emailIndex) => {
            if (item.email) lines.push(`${emailIndex === 0 ? "Correo" : `Correo ${emailIndex + 1}`}: ${item.email}`);
        });
        contact.addresses?.forEach((address, addressIndex) => {
            const value = [address.street, address.city, address.state, address.zip, address.country]
                .filter(Boolean).join(", ");
            if (value) lines.push(`${addressIndex === 0 ? "Dirección" : `Dirección ${addressIndex + 1}`}: ${value}`);
        });
        contact.urls?.forEach((item, urlIndex) => {
            if (item.url) lines.push(`${urlIndex === 0 ? "Sitio" : `Sitio ${urlIndex + 1}`}: ${item.url}`);
        });
        if (contact.birthday) lines.push(`Cumpleaños: ${contact.birthday}`);

        return lines.length ? lines.join("\n") : "Tarjeta de contacto sin datos visibles";
    }).join("\n\n");
}

export function sharedContactDetailsFromPayload(payload: Prisma.JsonValue | null): string | null {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const contacts = (payload as Prisma.JsonObject).contacts;
    return Array.isArray(contacts)
        ? formatSharedContacts(contacts as unknown as SharedContact[])
        : null;
}
