import axios from "axios";
import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { WhatsAppNumberService } from "./whatsapp-number.service";

const PROFILE_FIELDS = ["about", "address", "description", "email", "profile_picture_url", "websites", "vertical"] as const;
export type WhatsAppProfile = Partial<Record<(typeof PROFILE_FIELDS)[number], string | string[]>>;

async function graph<T>(numberId: string, workspaceId: string, method: "GET" | "POST" | "DELETE", path: string, data?: unknown): Promise<T> {
    const number = await WhatsAppNumberService.getById(workspaceId, numberId);
    if (!number) throw new Error("Número de WhatsApp no encontrado.");
    const credentials = WhatsAppNumberService.credentialsFor(number);
    const response = await axios.request<T>({
        method,
        url: `${appConfig.graphBaseUrl}/${credentials.apiVersion}/${path}`,
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
        ...(method === "GET" ? { params: { fields: "id,display_phone_number,verified_name,quality_rating,status,name_status,platform_type,throughput" } } : { data }),
        timeout: 15000
    });
    return response.data;
}

export class WhatsAppCloudOperationsService {
    static async blockUsers(workspaceId: string, numberId: string, method: "GET" | "POST" | "DELETE", users: string[] = []) {
        const number = await WhatsAppNumberService.getById(workspaceId, numberId);
        if (!number) throw new Error("Número de WhatsApp no encontrado.");
        const c = WhatsAppNumberService.credentialsFor(number);
        const response = await axios.request({
            method,
            url: `${appConfig.graphBaseUrl}/${c.apiVersion}/${c.phoneNumberId}/block_users`,
            headers: { Authorization: `Bearer ${c.accessToken}` },
            ...(method === "GET" ? {} : { data: { messaging_product: "whatsapp", block_users: users.map((user_id) => ({ user_id })) } }),
            timeout: 15000
        });
        return response.data;
    }

    static async readMessage(workspaceId: string, numberId: string, messageId: string) {
        const number = await WhatsAppNumberService.getById(workspaceId, numberId);
        if (!number) throw new Error("Número de WhatsApp no encontrado.");
        const c = WhatsAppNumberService.credentialsFor(number);
        const response = await axios.post(`${appConfig.graphBaseUrl}/${c.apiVersion}/${c.phoneNumberId}/messages`, {
            messaging_product: "whatsapp", status: "read", message_id: messageId
        }, { headers: { Authorization: `Bearer ${c.accessToken}` }, timeout: 10000 });
        return response.data;
    }

    static async sendTyping(workspaceId: string, numberId: string, messageId: string) {
        const number = await WhatsAppNumberService.getById(workspaceId, numberId);
        if (!number) throw new Error("Número de WhatsApp no encontrado.");
        const credentials = WhatsAppNumberService.credentialsFor(number);
        const response = await axios.post(`${appConfig.graphBaseUrl}/${credentials.apiVersion}/${credentials.phoneNumberId}/messages`, {
            messaging_product: "whatsapp", status: "read", message_id: messageId,
            typing_indicator: { type: "text" }
        }, { headers: { Authorization: `Bearer ${credentials.accessToken}` }, timeout: 10000 });
        return response.data;
    }

    static async react(workspaceId: string, numberId: string, to: string, messageId: string, emoji: string) {
        const number = await WhatsAppNumberService.getById(workspaceId, numberId);
        if (!number) throw new Error("Número de WhatsApp no encontrado.");
        const credentials = WhatsAppNumberService.credentialsFor(number);
        const response = await axios.post(`${appConfig.graphBaseUrl}/${credentials.apiVersion}/${credentials.phoneNumberId}/messages`, {
            messaging_product: "whatsapp", recipient_type: "individual", to, type: "reaction",
            reaction: { message_id: messageId, emoji }
        }, { headers: { Authorization: `Bearer ${credentials.accessToken}` }, timeout: 10000 });
        return response.data;
    }

    static async getProfile(workspaceId: string, numberId: string) {
        const number = await WhatsAppNumberService.getById(workspaceId, numberId);
        if (!number) throw new Error("Número de WhatsApp no encontrado.");
        const c = WhatsAppNumberService.credentialsFor(number);
        const response = await axios.get(`${appConfig.graphBaseUrl}/${c.apiVersion}/${c.phoneNumberId}/whatsapp_business_profile`, {
            params: { fields: PROFILE_FIELDS.join(","), access_token: c.accessToken }, timeout: 15000
        });
        return response.data;
    }

    static async updateProfile(workspaceId: string, numberId: string, profile: WhatsAppProfile) {
        const number = await WhatsAppNumberService.getById(workspaceId, numberId);
        if (!number) throw new Error("Número de WhatsApp no encontrado.");
        const c = WhatsAppNumberService.credentialsFor(number);
        const response = await axios.post(`${appConfig.graphBaseUrl}/${c.apiVersion}/${c.phoneNumberId}/whatsapp_business_profile`, {
            messaging_product: "whatsapp", ...profile
        }, { headers: { Authorization: `Bearer ${c.accessToken}` }, timeout: 15000 });
        return response.data;
    }

    static async health(workspaceId: string, numberId: string) {
        const number = await WhatsAppNumberService.getById(workspaceId, numberId);
        if (!number) throw new Error("Número de WhatsApp no encontrado.");
        const details = await graph<Record<string, unknown>>(numberId, workspaceId, "GET", WhatsAppNumberService.credentialsFor(number).phoneNumberId);
        const c = WhatsAppNumberService.credentialsFor(number);
        const listing = await axios.get(`${appConfig.graphBaseUrl}/${c.apiVersion}/${c.businessAccountId}/phone_numbers`, {
            params: { fields: "id,display_phone_number,verified_name,quality_rating,status,name_status,platform_type,throughput", access_token: c.accessToken }, timeout: 15000
        });
        return { number: details, numbers: listing.data?.data || [] };
    }

    static async deleteRemoteMedia(workspaceId: string, mediaId: string) {
        const account = await prisma.whatsAppAccount.findUnique({ where: { workspaceId } });
        if (!account) throw new Error("No hay cuenta de WhatsApp configurada.");
        const { decryptSecret } = await import("../utils/crypto");
        const response = await axios.delete(`${appConfig.graphBaseUrl}/${account.apiVersion}/${encodeURIComponent(mediaId)}`, {
            params: { access_token: decryptSecret(account.accessToken) }, timeout: 15000
        });
        return response.data;
    }
}
