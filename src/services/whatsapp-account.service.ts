import axios from "axios";
import { LogLevel, LogModule, Prisma } from "@prisma/client";

import { prisma } from "../config/prisma";
import { appConfig } from "../config/app.config";
import { decryptSecret, encryptSecret, isEncrypted } from "../utils/crypto";
import { maskSecret } from "../utils/mask";
import { LogService } from "./log.service";

type UpdateCredentialsInput = {
    displayName?: string;
    phoneNumber?: string;
    phoneNumberId?: string;
    businessAccountId?: string;
    apiVersion?: string;
    accessToken?: string;
    verifyToken?: string;
};

export class WhatsAppAccountService {
    static async getAccount(workspaceId: string) {
        const account = await prisma.whatsAppAccount.findUnique({
            where: {
                workspaceId
            }
        });

        if (!account) {
            throw new Error("No hay cuenta de WhatsApp configurada.");
        }

        const accessToken = decryptSecret(account.accessToken);
        const verifyToken = decryptSecret(account.verifyToken);

        const { accessToken: _omitAccess, verifyToken: _omitVerify, ...safe } =
            account;

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
        input: UpdateCredentialsInput
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

        if (input.displayName !== undefined) {
            data.displayName = input.displayName || null;
            changedFields.push("displayName");
        }

        if (input.phoneNumber) {
            data.phoneNumber = input.phoneNumber;
            changedFields.push("phoneNumber");
        }

        if (input.phoneNumberId) {
            data.phoneNumberId = input.phoneNumberId;
            changedFields.push("phoneNumberId");
        }

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

        const updated = await prisma.whatsAppAccount.update({
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
            id: updated.id,
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

    static async testConnection(workspaceId: string) {
        const account = await prisma.whatsAppAccount.findUnique({
            where: {
                workspaceId
            }
        });

        if (!account) {
            throw new Error("No hay cuenta de WhatsApp configurada.");
        }

        const accessToken = decryptSecret(account.accessToken);

        const url = `${appConfig.graphBaseUrl}/${account.apiVersion}/${account.phoneNumberId}`;

        try {
            const response = await axios.get(url, {
                params: {
                    fields: "id,display_phone_number,verified_name,quality_rating",
                        access_token: accessToken
                },
                timeout: 10000
            });

            const data = response.data as {
                id?: string;
                display_phone_number?: string;
                verified_name?: string;
                quality_rating?: string;
            };

            await prisma.whatsAppAccount.update({
                where: {
                    id: account.id
                },
                data: {
                    displayName: data.verified_name || account.displayName,
                    phoneNumber: data.display_phone_number || account.phoneNumber,
                    qualityRating: data.quality_rating || account.qualityRating,
                    status: "CONNECTED"
                }
            });

            await LogService.create({
                workspaceId,
                level: LogLevel.INFO,
                module: LogModule.WHATSAPP_ACCOUNT,
                action: "CONNECTION_TEST_SUCCESS",
                message: "Conexión con Meta validada correctamente.",
                payload: {
                    phoneNumberId: account.phoneNumberId,
                    response: data
                }
            });

            return {
                ok: true,
                message: "Conexión con Meta validada correctamente.",
                data
            };
        } catch (error) {
            const errorPayload =
                axios.isAxiosError(error)
                    ? {
                          status: error.response?.status,
                          data: error.response?.data,
                          message: error.message
                      }
                    : {
                          message:
                              error instanceof Error
                                  ? error.message
                                  : "Error desconocido"
                      };

            await prisma.whatsAppAccount.update({
                where: {
                    id: account.id
                },
                data: {
                    status: "ERROR"
                }
            });

            await LogService.create({
                workspaceId,
                level: LogLevel.ERROR,
                module: LogModule.WHATSAPP_ACCOUNT,
                action: "CONNECTION_TEST_FAILED",
                message: "No se pudo validar la conexión con Meta.",
                payload: {
                    phoneNumberId: account.phoneNumberId,
                    error: errorPayload
                }
            });

            return {
                ok: false,
                message: "No se pudo validar la conexión con Meta.",
                error: errorPayload
            };
        }
    }
}
