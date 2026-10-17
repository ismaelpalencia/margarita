import { ContactOutcomeType, LogLevel, LogModule } from "@prisma/client";
import dayjs from "dayjs";

import { prisma } from "../config/prisma";
import { parseLocalDateTime } from "../utils/date";
import { ContactOutcomeService, OutcomeValidationError } from "./contact-outcome.service";
import { LogService } from "./log.service";
import { SendPolicyService } from "./send-policy.service";

/**
 * Agenda de llamadas.
 *
 * La llamada pedida (resultado «volver a llamar») puede llevar fecha y hora.
 * Se guarda en UTC y se muestra en la zona de la empresa; el formulario manda
 * la hora local, que es la que ve quien agenda.
 */
export class CallScheduleService {
    static async schedule(params: {
        workspaceId: string;
        contactId: string;
        localDateTime: string;
        userId: string;
    }): Promise<Date> {
        const timezone = await SendPolicyService.timezoneFor(params.workspaceId);
        const when = parseLocalDateTime(params.localDateTime, timezone);

        if (!when) {
            throw new OutcomeValidationError(
                "La fecha y la hora de la llamada no se entienden."
            );
        }

        const contact = await prisma.contact.findFirst({
            where: { id: params.contactId, workspaceId: params.workspaceId },
            select: { id: true }
        });

        if (!contact) {
            throw new OutcomeValidationError("No se encontró el contacto.");
        }

        const label = dayjs(when).tz(timezone).format("DD/MM/YYYY HH:mm");

        /**
         * Se registra también como resultado «volver a llamar»: si el contacto
         * venía de otro estado, la tarea tiene que aparecer en la lista del día.
         */
        await ContactOutcomeService.mark({
            workspaceId: params.workspaceId,
            contactIds: [contact.id],
            userId: params.userId,
            type: ContactOutcomeType.CALLBACK,
            note: `Llamada agendada para ${label}`
        });

        await prisma.contact.update({
            where: { id: contact.id },
            data: { scheduledCallAt: when }
        });

        await LogService.create({
            workspaceId: params.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.CONTACT,
            action: "CALL_SCHEDULED",
            message: `Llamada agendada para ${label}.`,
            payload: {
                contactId: contact.id,
                scheduledCallAt: when.toISOString()
            }
        });

        return when;
    }

    /** Quita la cita y deja la tarea como llamada sin hora. */
    static async clear(params: {
        workspaceId: string;
        contactId: string;
    }): Promise<void> {
        await prisma.contact.updateMany({
            where: {
                id: params.contactId,
                workspaceId: params.workspaceId
            },
            data: { scheduledCallAt: null }
        });
    }
}
