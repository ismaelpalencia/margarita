import { LogLevel, LogModule, Prisma, WhatsAppAccount, WhatsAppNumber } from "@prisma/client";
import axios from "axios";

import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { decryptSecret, encryptSecret } from "../utils/crypto";
import { LogService } from "./log.service";

export type NumberWithAccount = WhatsAppNumber & {
    whatsappAccount: WhatsAppAccount;
};

export type NumberCredentials = {
    numberId: string;
    phoneNumberId: string;
    phoneNumber: string;
    displayName: string | null;
    businessAccountId: string;
    apiVersion: string;
    accessToken: string;
};

type NumberInput = {
    displayName?: string;
    phoneNumber?: string;
    phoneNumberId?: string;
};

/**
 * Los números de la WABA.
 *
 * La cuenta (WhatsAppAccount) aporta las credenciales —token, verify
 * token, versión de API y business account— y cada número aporta su
 * identidad y su propia calidad y límites.
 */
export class WhatsAppNumberService {
    static async listNumbers(workspaceId: string): Promise<NumberWithAccount[]> {
        return prisma.whatsAppNumber.findMany({
            where: {
                whatsappAccount: {
                    workspaceId
                }
            },
            include: {
                whatsappAccount: true
            },
            orderBy: [
                {
                    isActive: "desc"
                },
                {
                    createdAt: "asc"
                }
            ]
        });
    }

    static async getById(
        workspaceId: string,
        numberId: string
    ): Promise<NumberWithAccount | null> {
        return prisma.whatsAppNumber.findFirst({
            where: {
                id: numberId,
                whatsappAccount: {
                    workspaceId
                }
            },
            include: {
                whatsappAccount: true
            }
        });
    }

    static async getByPhoneNumberId(
        phoneNumberId: string
    ): Promise<NumberWithAccount | null> {
        return prisma.whatsAppNumber.findUnique({
            where: {
                phoneNumberId
            },
            include: {
                whatsappAccount: true
            }
        });
    }

    /**
     * El número que se usa cuando no se eligió ninguno: el primero activo.
     */
    static async getDefault(workspaceId: string): Promise<NumberWithAccount | null> {
        return prisma.whatsAppNumber.findFirst({
            where: {
                whatsappAccount: {
                    workspaceId
                },
                isActive: true
            },
            include: {
                whatsappAccount: true
            },
            orderBy: {
                createdAt: "asc"
            }
        });
    }

    static credentialsFor(number: NumberWithAccount): NumberCredentials {
        return {
            numberId: number.id,
            phoneNumberId: number.phoneNumberId,
            phoneNumber: number.phoneNumber,
            displayName: number.displayName,
            businessAccountId: number.whatsappAccount.businessAccountId,
            apiVersion: number.whatsappAccount.apiVersion,
            accessToken: decryptSecret(number.whatsappAccount.accessToken)
        };
    }

    static async createNumber(
        workspaceId: string,
        input: Required<Pick<NumberInput, "phoneNumber" | "phoneNumberId">> &
            NumberInput
    ) {
        const account = await prisma.whatsAppAccount.findUnique({
            where: {
                workspaceId
            }
        });

        if (!account) {
            throw new Error("Primero configura la cuenta de WhatsApp Business.");
        }

        const existing = await prisma.whatsAppNumber.findUnique({
            where: {
                phoneNumberId: input.phoneNumberId
            }
        });

        if (existing) {
            throw new Error(
                "Ese Phone Number ID ya está registrado. Revisa que pertenezca a otra instalación."
            );
        }

        const number = await prisma.whatsAppNumber.create({
            data: {
                whatsappAccountId: account.id,
                phoneNumberId: input.phoneNumberId,
                phoneNumber: input.phoneNumber,
                displayName: input.displayName || null,
                isActive: true
            }
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.INFO,
            module: LogModule.WHATSAPP_ACCOUNT,
            action: "WHATSAPP_NUMBER_CREATED",
            message: "Se agregó un número a la cuenta.",
            payload: {
                numberId: number.id,
                phoneNumberId: number.phoneNumberId
            }
        });

        return number;
    }

    static async updateNumber(
        workspaceId: string,
        numberId: string,
        input: NumberInput
    ) {
        const number = await this.getById(workspaceId, numberId);

        if (!number) {
            throw new Error("Número no encontrado.");
        }

        const data: Prisma.WhatsAppNumberUpdateInput = {};
        const changed: string[] = [];

        if (input.displayName !== undefined) {
            data.displayName = input.displayName || null;
            changed.push("displayName");
        }

        if (input.phoneNumber) {
            data.phoneNumber = input.phoneNumber;
            changed.push("phoneNumber");
        }

        if (input.phoneNumberId && input.phoneNumberId !== number.phoneNumberId) {
            const inUse = await prisma.conversation.count({
                where: {
                    whatsappNumberId: number.id
                }
            });

            if (inUse > 0) {
                throw new Error(
                    "Este número ya tiene conversaciones: no se puede cambiar su Phone Number ID. Agrega uno nuevo en su lugar."
                );
            }

            data.phoneNumberId = input.phoneNumberId;
            changed.push("phoneNumberId");
        }

        if (changed.length === 0) {
            throw new Error("No hay cambios por guardar.");
        }

        await prisma.whatsAppNumber.update({
            where: {
                id: number.id
            },
            data
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.INFO,
            module: LogModule.WHATSAPP_ACCOUNT,
            action: "WHATSAPP_NUMBER_UPDATED",
            message: "Se actualizó un número de la cuenta.",
            payload: {
                numberId: number.id,
                changed
            }
        });
    }

    static async setAiEnabled(
        workspaceId: string,
        numberId: string,
        aiEnabled: boolean
    ) {
        const number = await this.getById(workspaceId, numberId);

        if (!number) {
            throw new Error("Número no encontrado.");
        }

        return prisma.whatsAppNumber.update({
            where: { id: number.id },
            data: { aiEnabled }
        });
    }

    static async setFlowsEnabled(
        workspaceId: string,
        numberId: string,
        flowsEnabled: boolean
    ) {
        const number = await this.getById(workspaceId, numberId);

        if (!number) {
            throw new Error("Número no encontrado.");
        }

        return prisma.whatsAppNumber.update({
            where: { id: number.id },
            data: { flowsEnabled }
        });
    }

    static async setActive(
        workspaceId: string,
        numberId: string,
        isActive: boolean
    ) {
        const number = await this.getById(workspaceId, numberId);

        if (!number) {
            throw new Error("Número no encontrado.");
        }

        if (!isActive) {
            const active = await prisma.whatsAppNumber.count({
                where: {
                    whatsappAccountId: number.whatsappAccountId,
                    isActive: true
                }
            });

            if (active <= 1) {
                throw new Error(
                    "No puedes desactivar el último número activo de la cuenta."
                );
            }
        }

        await prisma.whatsAppNumber.update({
            where: {
                id: number.id
            },
            data: {
                isActive
            }
        });

        await LogService.create({
            workspaceId,
            level: LogLevel.INFO,
            module: LogModule.WHATSAPP_ACCOUNT,
            action: isActive ? "WHATSAPP_NUMBER_ENABLED" : "WHATSAPP_NUMBER_DISABLED",
            message: isActive
                ? "Número activado."
                : "Número desactivado.",
            payload: {
                numberId: number.id
            }
        });
    }

    /**
     * Consulta a Meta los datos del número y guarda su calidad. Se hace
     * por número porque la calidad y el estado son individuales.
     */
    static async testConnection(workspaceId: string, numberId: string) {
        const number = await this.getById(workspaceId, numberId);

        if (!number) {
            throw new Error("Número no encontrado.");
        }

        const credentials = this.credentialsFor(number);
        const url = `${appConfig.graphBaseUrl}/${credentials.apiVersion}/${credentials.phoneNumberId}`;

        try {
            const response = await axios.get(url, {
                params: {
                    fields: "id,display_phone_number,verified_name,quality_rating",
                    access_token: credentials.accessToken
                },
                timeout: 10000
            });

            const data = response.data as {
                display_phone_number?: string;
                verified_name?: string;
                quality_rating?: string;
            };

            await prisma.whatsAppNumber.update({
                where: {
                    id: number.id
                },
                data: {
                    displayName: data.verified_name || number.displayName,
                    phoneNumber: data.display_phone_number || number.phoneNumber,
                    qualityRating: data.quality_rating || number.qualityRating,
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
                    numberId: number.id,
                    phoneNumberId: number.phoneNumberId,
                    response: data
                }
            });

            return {
                ok: true as const,
                message: "Conexión con Meta validada correctamente.",
                data
            };
        } catch (error) {
            const errorPayload = axios.isAxiosError(error)
                ? {
                      status: error.response?.status,
                      data: error.response?.data,
                      message: error.message
                  }
                : {
                      message:
                          error instanceof Error ? error.message : "Error desconocido"
                  };

            await prisma.whatsAppNumber.update({
                where: {
                    id: number.id
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
                    numberId: number.id,
                    phoneNumberId: number.phoneNumberId,
                    error: errorPayload
                }
            });

            return {
                ok: false as const,
                message: "No se pudo validar la conexión con Meta.",
                error: errorPayload
            };
        }
    }
}
