import { Request, Response } from "express";
import { LogLevel, LogModule, Prisma } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { LogService } from "../services/log.service";
import { WebhookService } from "../services/webhook.service";
import { MetaWebhookHandlerService } from "../services/meta-webhook-handler.service";
import { MetaWebhookPayload } from "../types/meta-webhook";
import { extractPhoneNumberId } from "../utils/meta-payload";
import { verifyMetaSignature } from "../utils/webhook-signature";

let missingSecretWarningLogged = false;

export class MetaWebhookController {
    static async verify(req: Request, res: Response) {
        try {
            const challenge = await WebhookService.verifyMetaWebhook({
                mode:
                    typeof req.query["hub.mode"] === "string"
                        ? req.query["hub.mode"]
                        : undefined,
                token:
                    typeof req.query["hub.verify_token"] === "string"
                        ? req.query["hub.verify_token"]
                        : undefined,
                challenge:
                    typeof req.query["hub.challenge"] === "string"
                        ? req.query["hub.challenge"]
                        : undefined
            });

            return res.status(200).send(challenge);
        } catch (error) {
            /**
             * Meta solo ve un 403 y no hay forma de saber qué falló desde
             * afuera. Guardamos el motivo en la bitácora y en los logs del
             * servicio para que el diagnóstico sea inmediato.
             */
            logger.warn(
                {
                    reason:
                        error instanceof Error
                            ? error.message
                            : "Error desconocido",
                    hasVerifyToken: Boolean(req.query["hub.verify_token"]),
                    mode: req.query["hub.mode"]
                },
                "Verificación del webhook de Meta rechazada"
            );

            return res.sendStatus(403);
        }
    }

    static async receive(req: Request, res: Response) {
        const signatureHeader = req.headers["x-hub-signature-256"];

        if (!appConfig.metaAppSecret) {
            /**
             * Sin META_APP_SECRET no podemos verificar el origen.
             * En producción rechazamos; en desarrollo avisamos y seguimos
             * para no romper las pruebas locales con ngrok.
             */
            if (!missingSecretWarningLogged) {
                missingSecretWarningLogged = true;

                await LogService.create({
                    level: LogLevel.WARN,
                    module: LogModule.WEBHOOK,
                    action: "WEBHOOK_SIGNATURE_SECRET_MISSING",
                    message:
                        "META_APP_SECRET no está configurado: la firma del webhook no se está validando.",
                    payload: {
                        env: appConfig.env
                    }
                });

                console.warn(
                    "[webhook] META_APP_SECRET no configurado: no se valida la firma X-Hub-Signature-256."
                );
            }

            if (appConfig.env === "production") {
                return res.sendStatus(401);
            }
        } else {
            const signatureIsValid = verifyMetaSignature({
                rawBody: req.rawBody,
                signatureHeader,
                appSecret: appConfig.metaAppSecret
            });

            if (!signatureIsValid) {
                await LogService.create({
                    level: LogLevel.WARN,
                    module: LogModule.WEBHOOK,
                    action: "WEBHOOK_SIGNATURE_INVALID",
                    message:
                        "Webhook rechazado: la firma X-Hub-Signature-256 no es válida.",
                    payload: {
                        hasSignature: Boolean(signatureHeader),
                        hasRawBody: Boolean(req.rawBody)
                    }
                });

                return res.sendStatus(401);
            }
        }

        const payload = req.body as MetaWebhookPayload;

        /**
         * Con la cola activa, el webhook solo se guarda y se responde 200
         * de inmediato. El worker lo procesa con reintentos y backoff, así
         * que un fallo temporal ya no pierde el mensaje del cliente.
         */
        if (appConfig.webhookQueueEnabled) {
            try {
                await prisma.webhookEvent.create({
                    data: {
                        payload: JSON.parse(
                            JSON.stringify(payload)
                        ) as Prisma.InputJsonValue,
                        phoneNumberId: extractPhoneNumberId(payload)
                    }
                });

                return res.sendStatus(200);
            } catch (error) {
                console.error("No se pudo encolar el webhook:", error);

                /**
                 * Si no pudimos guardar el evento, respondemos 500 para
                 * que Meta lo reintente: perderlo sería perder el mensaje.
                 */
                return res.sendStatus(500);
            }
        }

        /**
         * Modo directo (WEBHOOK_QUEUE_ENABLED=false), útil para depurar
         * en local. Se responde 200 incluso ante error para evitar
         * reintentos infinitos de Meta.
         */
        try {
            await MetaWebhookHandlerService.handleIncomingPayload(payload);

            return res.sendStatus(200);
        } catch (error) {
            console.error("Error procesando webhook:", error);

            return res.sendStatus(200);
        }
    }
}
