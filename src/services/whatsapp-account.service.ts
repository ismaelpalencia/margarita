import axios from "axios";
import { LogLevel, LogModule } from "@prisma/client";

import { prisma } from "../config/prisma";
import { maskSecret } from "../utils/mask";
import { LogService } from "./log.service";

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

        return {
            ...account,
            maskedAccessToken: maskSecret(account.accessToken),
            maskedVerifyToken: maskSecret(account.verifyToken)
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

        const url = `https://graph.facebook.com/${account.apiVersion}/${account.phoneNumberId}`;

        try {
            const response = await axios.get(url, {
                params: {
                    fields: "id,display_phone_number,verified_name,quality_rating",
                    access_token: account.accessToken
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
