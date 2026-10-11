import { LogLevel, LogModule, Prisma } from "@prisma/client";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { decryptSecret, encryptSecret, isEncrypted } from "../utils/crypto";
import { maskSecret } from "../utils/mask";
import { LogService } from "./log.service";

type UpdateAccountInput = {
    businessAccountId?: string;
    apiVersion?: string;
    accessToken?: string;
    verifyToken?: string;
};

/**
 * La cuenta de WhatsApp Business (la WABA): guarda las credenciales que
 * comparten todos los números, más el verify token del webhook.
 */
export class WhatsAppAccountService {
    static async getAccount(workspaceId: string) {
        const account = await prisma.whatsAppAccount.findUnique({
            where: {
                workspaceId
            },
            include: {
                numbers: {
                    orderBy: {
                        createdAt: "asc"
                    }
                }
            }
        });

        if (!account) {
            throw new Error("No hay cuenta de WhatsApp configurada.");
        }

        const accessToken = decryptSecret(account.accessToken);
        const verifyToken = decryptSecret(account.verifyToken);

        const {
            accessToken: _omitAccess,
            verifyToken: _omitVerify,
            ...safe
        } = account;

        return {
            ...safe,
            maskedAccessToken: maskSecret(accessToken),
            maskedVerifyToken: maskSecret(verifyToken),
            accessTokenConfigured: Boolean(accessToken),
            verifyTokenConfigured: Boolean(verifyToken),
            /**
             * Se muestran en la interfaz para que el admin sepa si las
             * credenciales ya están cifradas en la base de datos.
             */
            encryptedAtRest:
                isEncrypted(account.accessToken) &&
                isEncrypted(account.verifyToken)
        };
    }

    static async updateCredentials(
        workspaceId: string,
        input: UpdateAccountInput
    ) {
        const account = await prisma.whatsAppAccount.findUnique({
            where: {
                workspaceId
            }
        });

        if (!account) {
            throw new Error("No hay cuenta de WhatsApp configurada.");
        }

        const data: Prisma.WhatsAppAccountUpdateInput = {};
        const changedFields: string[] = [];

        if (input.businessAccountId) {
            data.businessAccountId = input.businessAccountId;
            changedFields.push("businessAccountId");
        }

        if (input.apiVersion) {
            data.apiVersion = input.apiVersion;
            changedFields.push("apiVersion");
        }

        if (input.accessToken) {
            data.accessToken = encryptSecret(input.accessToken);
            changedFields.push("accessToken");
        }

        if (input.verifyToken) {
            data.verifyToken = encryptSecret(input.verifyToken);
            changedFields.push("verifyToken");
        }

        if (changedFields.length === 0) {
            throw new Error("No hay cambios por guardar.");
        }

        await prisma.whatsAppAccount.update({
            where: {
                id: account.id
            },
            data
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.INFO,
            module: LogModule.WHATSAPP_ACCOUNT,
            action: "WHATSAPP_ACCOUNT_UPDATED",
            message: "Credenciales de WhatsApp actualizadas.",
            /**
             * Solo se registra qué campos cambiaron, nunca sus valores.
             */
            payload: {
                changedFields
            }
        });

        return {
            id: account.id,
            changedFields
        };
    }

    static async encryptStoredCredentials(workspaceId: string) {
        const account = await prisma.whatsAppAccount.findUnique({
            where: {
                workspaceId
            }
        });

        if (!account) {
            throw new Error("No hay cuenta de WhatsApp configurada.");
        }

        if (!appConfig.encryptionKey) {
            throw new Error(
                "Configura ENCRYPTION_KEY en las variables de entorno antes de cifrar."
            );
        }

        const data: { accessToken?: string; verifyToken?: string } = {};

        if (account.accessToken && !isEncrypted(account.accessToken)) {
            data.accessToken = encryptSecret(account.accessToken);
        }

        if (account.verifyToken && !isEncrypted(account.verifyToken)) {
            data.verifyToken = encryptSecret(account.verifyToken);
        }

        if (Object.keys(data).length === 0) {
            return {
                changed: false
            };
        }

        await prisma.whatsAppAccount.update({
            where: {
                id: account.id
            },
            data
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.INFO,
            module: LogModule.WHATSAPP_ACCOUNT,
            action: "WHATSAPP_CREDENTIALS_ENCRYPTED",
            message: "Credenciales de WhatsApp cifradas en la base de datos.",
            payload: {
                fields: Object.keys(data)
            }
        });

        return {
            changed: true
        };
    }
}
