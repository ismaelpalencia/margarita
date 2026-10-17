import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import { ContactOutcomeType } from "@prisma/client";

import { appConfig } from "../../src/config/app.config";
import { prisma } from "../../src/config/prisma";
import { ContactOutcomeService } from "../../src/services/contact-outcome.service";
import { ReportService } from "../../src/services/report.service";
import { SendPolicyService } from "../../src/services/send-policy.service";
import { contactPhoneFields } from "../../src/utils/phone";
import {
    cleanupWorkspace,
    createWorkspaceFixture,
    disconnectFixtures,
    testPhone,
    WorkspaceFixture
} from "./helpers";

/**
 * Fase 4, por HTTP: la llamada pedida es una tarea de la pantalla «Hoy», se
 * puede despachar con un clic, y el volcado del webhook se puede copiar desde
 * el panel (que es lo que hace falta para comprobar un botón contra Meta real).
 */

let fixture: WorkspaceFixture;
let cookie = "";

before(async () => {
    fixture = await createWorkspaceFixture();
    /**
     * Una sola sesión para todo el archivo: el acceso tiene tope por IP y las
     * pruebas de integración enteras salen de la misma dirección.
     */
    cookie = await login(fixture.adminEmail, fixture.adminPassword);
});

after(async () => {
    /**
     * El evento en cola no lleva empresa, así que no cae con el borrado del
     * workspace: se limpia por el número que lo recibió.
     */
    await prisma.webhookEvent.deleteMany({
        where: { phoneNumberId: fixture.phoneNumberId }
    });

    await cleanupWorkspace(fixture.workspaceId);
    await disconnectFixtures();
    await prisma.$disconnect();
});

function baseUrl(): string {
    return process.env.INTEGRATION_BASE_URL || "http://127.0.0.1:3987";
}

async function login(email: string, password: string) {
    const response = await fetch(`${baseUrl()}/auth/login`, {
        method: "POST",
        redirect: "manual",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email, password }).toString()
    });

    const cookie = response.headers
        .getSetCookie()
        .find((value) => value.startsWith(`${appConfig.cookieName}=`));

    return cookie ? cookie.split(";")[0] : "";
}

async function visit(path: string, cookie: string) {
    const response = await fetch(`${baseUrl()}${path}`, {
        headers: cookie ? { cookie } : {},
        redirect: "manual"
    });

    return {
        status: response.status,
        body: response.status === 200 ? await response.text() : ""
    };
}

async function createContact(name: string) {
    return prisma.contact.create({
        data: {
            workspaceId: fixture.workspaceId,
            ...contactPhoneFields(testPhone()),
            customName: name
        },
        select: { id: true }
    });
}

test("la llamada pedida aparece en la lista de hoy, con su atajo", async () => {
    const name = `Cliente PideLlamada ${Date.now()}`;
    const contact = await createContact(name);

    /** Tal como queda cuando el deudor toca el botón. */
    await ContactOutcomeService.mark({
        workspaceId: fixture.workspaceId,
        contactIds: [contact.id],
        userId: null,
        type: ContactOutcomeType.CALLBACK,
        note: "Tocó el botón «Quiero que me llame un asesor».",
        source: "INTERACTIVE"
    });

    const page = await visit("/admin/reports?vista=hoy", cookie);

    assert.equal(page.status, 200, "la pantalla de hoy responde");
    assert.match(
        page.body,
        /Pidieron que los llamen/,
        "el bloque de llamadas se pinta"
    );
    assert.match(page.body, new RegExp(name), "con el cliente que lo pidió");
    assert.match(
        page.body,
        /\/admin\/reports\/mark-call/,
        "y con el atajo para despacharla sin abrir la ficha"
    );
    assert.match(
        page.body,
        /El botón/,
        "diciendo que la llamada salió del botón, no del equipo"
    );

    /** La ficha del contacto lo dice igual, para quien entra por ahí. */
    const ficha = await visit(`/admin/contacts/${contact.id}/edit`, cookie);

    assert.equal(ficha.status, 200, "la ficha del contacto responde");
    assert.match(
        ficha.body,
        /Esperando llamada hace/,
        "y avisa cuánto lleva esperando la llamada"
    );
});

test("el atajo guarda «sin contestación» y saca al cliente de la lista", async () => {
    const contact = await createContact(`Cliente Atajo ${Date.now()}`);

    await ContactOutcomeService.mark({
        workspaceId: fixture.workspaceId,
        contactIds: [contact.id],
        userId: null,
        type: ContactOutcomeType.CALLBACK,
        source: "INTERACTIVE"
    });

    const response = await fetch(`${baseUrl()}/admin/reports/mark-call`, {
        method: "POST",
        redirect: "manual",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie
        },
        body: new URLSearchParams({
            contactId: contact.id,
            type: ContactOutcomeType.NO_ANSWER
        }).toString()
    });

    assert.equal(response.status, 302, "el atajo responde con una redirección");
    assert.match(
        response.headers.get("location") || "",
        /vista=hoy&success=marked/,
        "y regresa a la lista con la confirmación"
    );

    const stored = await prisma.contact.findUniqueOrThrow({
        where: { id: contact.id },
        select: { outcomeType: true }
    });

    assert.equal(
        stored.outcomeType,
        ContactOutcomeType.NO_ANSWER,
        "el resultado queda guardado"
    );

    const timezone = await SendPolicyService.timezoneFor(fixture.workspaceId);
    const pendientes = await ReportService.callRequests(
        fixture.workspaceId,
        timezone
    );

    assert.equal(
        pendientes.some((row) => row.contactId === contact.id),
        false,
        "y ya no está en las llamadas pendientes"
    );
});

test("un resultado que no es del atajo no se guarda a la brava", async () => {
    const contact = await createContact(`Cliente Raro ${Date.now()}`);

    const response = await fetch(`${baseUrl()}/admin/reports/mark-call`, {
        method: "POST",
        redirect: "manual",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie
        },
        body: new URLSearchParams({
            contactId: contact.id,
            /** «Pagado» necesita monto y fecha: no se puede marcar en un clic. */
            type: ContactOutcomeType.PAID
        }).toString()
    });

    assert.match(
        response.headers.get("location") || "",
        /error=mark/,
        "se rechaza y se avisa"
    );

    const stored = await prisma.contact.findUniqueOrThrow({
        where: { id: contact.id },
        select: { outcomeType: true }
    });

    assert.equal(stored.outcomeType, null, "y el contacto queda como estaba");
});

test("el volcado del webhook se puede copiar desde el panel", async () => {
    await prisma.webhookEvent.create({
        data: {
            workspaceId: fixture.workspaceId,
            phoneNumberId: fixture.phoneNumberId,
            status: "PROCESSED",
            payload: {
                object: "whatsapp_business_account",
                entry: [
                    {
                        id: `waba-${fixture.workspaceId}`,
                        changes: [
                            {
                                field: "messages",
                                value: {
                                    messages: [
                                        {
                                            from: "5215500000000",
                                            id: "wamid.prueba-de-boton",
                                            type: "interactive",
                                            button: {
                                                text: "Quiero que me llame un asesor",
                                                payload: "BOTON-DE-PRUEBA"
                                            }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                ]
            }
        }
    });

    const page = await visit("/admin/logs/webhooks", cookie);

    assert.equal(page.status, 200, "la pantalla de webhooks responde");
    assert.match(
        page.body,
        /BOTON-DE-PRUEBA/,
        "el identificador del botón se ve en el volcado"
    );
    assert.match(
        page.body,
        /data-copy-target="webhook-/,
        "y hay un botón para copiar el evento completo"
    );

    /**
     * Un evento recién llegado, todavía en cola, no tiene empresa asignada:
     * el worker la resuelve al procesarlo. Tiene que verse igual, porque es el
     * que se acaba de provocar al tocar el botón.
     */
    await prisma.webhookEvent.create({
        data: {
            phoneNumberId: fixture.phoneNumberId,
            status: "PENDING",
            payload: {
                entry: [
                    {
                        changes: [
                            {
                                field: "messages",
                                value: { mensaje: "RECIEN-LLEGADO" }
                            }
                        ]
                    }
                ]
            }
        }
    });

    const conPendiente = await visit("/admin/logs/webhooks", cookie);

    assert.match(
        conPendiente.body,
        /RECIEN-LLEGADO/,
        "y un evento en cola, sin empresa asignada, también se ve"
    );
});

/**
 * Agenda de llamadas (fase B2): la llamada pedida puede llevar fecha y hora.
 * Se guarda en UTC y se muestra en la zona de la empresa.
 */
test("una llamada pedida se agenda, aparece en Hoy y se puede quitar", async () => {
    const contact = await createContact(`Cliente Cita ${Date.now()}`);

    await ContactOutcomeService.mark({
        workspaceId: fixture.workspaceId,
        contactIds: [contact.id],
        userId: fixture.adminId,
        type: ContactOutcomeType.CALLBACK
    });

    const cita = "2026-12-01T10:30";

    const agenda = await fetch(`${baseUrl()}/admin/reports/schedule-call`, {
        method: "POST",
        redirect: "manual",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie
        },
        body: new URLSearchParams({
            contactId: contact.id,
            scheduledFor: cita
        }).toString()
    });

    assert.equal(agenda.status, 302, "agendar responde con redirección");
    assert.match(
        agenda.headers.get("location") || "",
        /success=marked/,
        "y vuelve con la confirmación"
    );

    const guardada = await prisma.contact.findUniqueOrThrow({
        where: { id: contact.id },
        select: { scheduledCallAt: true, outcomeType: true }
    });

    assert.ok(guardada.scheduledCallAt, "la cita queda guardada");
    assert.equal(
        guardada.scheduledCallAt!.toISOString(),
        "2026-12-01T16:30:00.000Z",
        "10:30 en la empresa son 16:30 UTC"
    );
    assert.equal(guardada.outcomeType, ContactOutcomeType.CALLBACK);

    const timezone = await SendPolicyService.timezoneFor(fixture.workspaceId);
    const pendientes = await ReportService.callRequests(
        fixture.workspaceId,
        timezone
    );
    const item = pendientes.find((row) => row.contactId === contact.id);

    assert.ok(item, "sigue en las llamadas pedidas");
    assert.equal(item!.scheduledLabel, "01/12/2026 10:30");
    assert.equal(item!.scheduledDue, false, "todavía no toca");

    const pagina = await visit("/admin/reports?vista=hoy", cookie);
    assert.match(pagina.body, /Agendada · 01\/12\/2026 10:30/);

    const quitar = await fetch(`${baseUrl()}/admin/reports/schedule-call`, {
        method: "POST",
        redirect: "manual",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            cookie
        },
        body: new URLSearchParams({
            contactId: contact.id,
            clear: "1"
        }).toString()
    });

    assert.equal(quitar.status, 302);

    const sinCita = await prisma.contact.findUniqueOrThrow({
        where: { id: contact.id },
        select: { scheduledCallAt: true }
    });

    assert.equal(sinCita.scheduledCallAt, null, "la cita se puede quitar");
});
