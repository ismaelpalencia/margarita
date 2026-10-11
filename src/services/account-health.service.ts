import { LogLevel, LogModule } from "@prisma/client";

import { prisma } from "../config/prisma";
import {
    describeReason,
    mapQualityEvent,
    mapTemplateEvent
} from "../utils/whatsapp-events";
import { LogService } from "./log.service";

type TemplateStatusValue = {
    event?: string;
    reason?: unknown;
    message_template_id?: string;
    message_template_name?: string;
    message_template_language?: string;
};

type QualityValue = {
    event?: string;
    current_limit?: string;
    display_phone_number?: string;
    metadata?: {
        phone_number_id?: string;
    };
};

/**
 * Avisos de Meta sobre la cuenta: plantillas que cambian de estado y
 * calidad de los números.
 *
 * Antes solo se procesaba el campo `messages`, así que una plantilla
 * rechazada o un número marcado se descubrían entrando al panel de Meta.
 * Ahora quedan en la bitácora y disparan la alerta externa si está
 * configurada.
 */
export class AccountHealthService {
    /**
     * `message_template_status_update`: el aviso llega a nivel de WABA,
     * por eso se resuelve la cuenta con el id de la entrada.
     */
    static async handleTemplateStatus(
        businessAccountId: string | undefined,
        value: TemplateStatusValue
    ) {
        const mapped = mapTemplateEvent(value.event);

        if (!mapped) {
            return;
        }

        const account = businessAccountId
            ? await prisma.whatsAppAccount.findFirst({
                  where: {
                      businessAccountId
                  }
              })
            : null;

        const template = account
            ? await prisma.template.findFirst({
                  where: {
                      workspaceId: account.workspaceId,
                      OR: [
                          ...(value.message_template_id
                              ? [{ metaTemplateId: value.message_template_id }]
                              : []),
                          ...(value.message_template_name
                              ? [
                                    {
                                        name: value.message_template_name,
                                        language:
                                            value.message_template_language ||
                                            undefined
                                    }
                                ]
                              : [])
                      ]
                  }
              })
            : null;

        if (template) {
            await prisma.template.update({
                where: {
                    id: template.id
                },
                data: {
                    status: mapped.status
                }
            });
        }

        const reason = describeReason(value.reason);

        await LogService.create({
            workspaceId: account?.workspaceId || null,
            level: mapped.critical ? LogLevel.WARN : LogLevel.INFO,
            module: LogModule.META,
            action: `TEMPLATE_STATUS_${String(value.event).toUpperCase()}`,
            message: `${mapped.description}${reason ? ` Motivo: ${reason}.` : ""}`,
            payload: {
                templateId: template?.id || null,
                templateName: value.message_template_name || null,
                language: value.message_template_language || null,
                event: value.event,
                reason
            }
        });
    }

    /**
     * `phone_number_quality_update`: la calidad y el nivel de mensajería
     * son por número.
     */
    static async handleQualityUpdate(value: QualityValue) {
        const mapped = mapQualityEvent(value.event);

        if (!mapped) {
            return;
        }

        const number = value.metadata?.phone_number_id
            ? await prisma.whatsAppNumber.findUnique({
                  where: {
                      phoneNumberId: value.metadata.phone_number_id
                  },
                  include: {
                      whatsappAccount: true
                  }
              })
            : value.display_phone_number
              ? await prisma.whatsAppNumber.findFirst({
                    where: {
                        phoneNumber: value.display_phone_number
                    },
                    include: {
                        whatsappAccount: true
                    }
                })
              : null;

        if (number) {
            await prisma.whatsAppNumber.update({
                where: {
                    id: number.id
                },
                data: {
                    status: mapped.status,
                    ...(value.current_limit
                        ? {
                              messagingLimit: value.current_limit
                          }
                        : {})
                }
            });
        }

        const limitText = value.current_limit
            ? ` Nivel de mensajería: ${value.current_limit}.`
            : "";

        await LogService.create({
            workspaceId: number?.whatsappAccount.workspaceId || null,
            level: mapped.critical ? LogLevel.ERROR : LogLevel.INFO,
            module: LogModule.WHATSAPP_ACCOUNT,
            action: `PHONE_QUALITY_${String(value.event).toUpperCase()}`,
            message: `${mapped.description}${limitText}`,
            payload: {
                numberId: number?.id || null,
                phoneNumberId: value.metadata?.phone_number_id || null,
                displayPhoneNumber: value.display_phone_number || null,
                event: value.event,
                currentLimit: value.current_limit || null
            }
        });
    }
}
