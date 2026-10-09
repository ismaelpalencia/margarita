import { LogLevel, LogModule } from "@prisma/client";

import { prisma } from "../config/prisma";
import { LogService } from "./log.service";

type VerifyWebhookParams = {
    mode?: string;
    token?: string;
    challenge?: string;
};

export class WebhookService {
    static async verifyMetaWebhook(params: VerifyWebhookParams) {
        const { mode, token, challenge } = params;

        if (!mode || !token || !challenge) {
            await LogService.create({
                level: LogLevel.WARN,
                module: LogModule.WEBHOOK,
                action: "WEBHOOK_VERIFY_MISSING_PARAMS",
                message: "Meta intentó verificar el webhook sin parámetros completos.",
                payload: {
                    mode,
                    hasToken: Boolean(token),
                    hasChallenge: Boolean(challenge)
                }
            });

            throw new Error("Parámetros incompletos.");
        }

        const account = await prisma.whatsAppAccount.findFirst();

        if (!account) {
            await LogService.create({
                level: LogLevel.ERROR,
                module: LogModule.WEBHOOK,
                action: "WEBHOOK_VERIFY_NO_ACCOUNT",
                message: "No existe cuenta de WhatsApp configurada para verificar webhook.",
                payload: {
                    mode
                }
            });

            throw new Error("No hay cuenta de WhatsApp configurada.");
        }

        if (mode !== "subscribe") {
            await LogService.create({
                workspaceId: account.workspaceId,
                level: LogLevel.WARN,
                module: LogModule.WEBHOOK,
                action: "WEBHOOK_VERIFY_INVALID_MODE",
                message: "Meta envió un modo inválido al verificar webhook.",
                payload: {
                    mode
                }
            });

            throw new Error("Modo inválido.");
        }

        if (token !== account.verifyToken) {
            await LogService.create({
                workspaceId: account.workspaceId,
                level: LogLevel.WARN,
                module: LogModule.WEBHOOK,
                action: "WEBHOOK_VERIFY_INVALID_TOKEN",
                message: "Meta envió un verify token incorrecto.",
                payload: {
                    mode
                }
            });

            throw new Error("Token inválido.");
        }

        await LogService.create({
            workspaceId: account.workspaceId,
            level: LogLevel.INFO,
            module: LogModule.WEBHOOK,
            action: "WEBHOOK_VERIFY_SUCCESS",
            message: "Webhook de Meta verificado correctamente.",
            payload: {
                mode
            }
        });

        return challenge;
    }
}
