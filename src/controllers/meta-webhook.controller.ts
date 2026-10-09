import { Request, Response } from "express";
import { LogLevel, LogModule } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { LogService } from "../services/log.service";
import { WebhookService } from "../services/webhook.service";
import { MetaWebhookHandlerService } from "../services/meta-webhook-handler.service";
import { MetaWebhookPayload } from "../types/meta-webhook";
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
        } catch {
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

        try {
            await MetaWebhookHandlerService.handleIncomingPayload(
                req.body as MetaWebhookPayload
            );

            return res.sendStatus(200);
        } catch (error) {
            console.error("Error procesando webhook:", error);

            /**
             * Importante:
             * A Meta le respondemos 200 para evitar reintentos infinitos
             * durante desarrollo. El error queda en consola/logs.
             */
            return res.sendStatus(200);
        }
    }
}
