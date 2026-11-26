import axios from "axios";
import { appConfig } from "../config/app.config";
import { prisma } from "../config/prisma";
import { decryptSecret } from "../utils/crypto";
import { WhatsAppNumberService } from "./whatsapp-number.service";

const PROFILE_FIELDS = ["about", "address", "description", "email", "profile_picture_url", "websites", "vertical"] as const;
export type WhatsAppProfile = Partial<Record<(typeof PROFILE_FIELDS)[number], string | string[]>>;

function numberValue(value: unknown): number {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function analyticsPoints(response: unknown): Array<Record<string, unknown>> {
    if (!response || typeof response !== "object") return [];
    const root = response as Record<string, unknown>;
    const data = Array.isArray(root.data) ? root.data : [];
    return data.flatMap((item) => item && typeof item === "object" && Array.isArray((item as Record<string, unknown>).data_points)
        ? (item as { data_points: Array<Record<string, unknown>> }).data_points
        : []);
}

function summarizeAnalytics(response: unknown, kind: "pricing" | "calls") {
    const points = analyticsPoints(response);
    const volume = points.reduce((sum, point) => sum + numberValue(point.volume), 0);
    const count = points.reduce((sum, point) => sum + numberValue(point.count), 0);
    const cost = points.reduce((sum, point) => sum + numberValue(point.cost), 0);
    const weightedDuration = points.reduce((sum, point) => sum + numberValue(point.average_duration) * numberValue(point.count), 0);
    return kind === "pricing"
        ? { points: points.length, volume, cost }
        : { points: points.length, count, averageDurationSeconds: count ? Math.round(weightedDuration / count) : 0, cost };
}

export function buildBlockUsersPayload(users: string[]) {
    return {
        messaging_product: "whatsapp",
        block_users: users.map((user) => ({ user }))
    };
}

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
    private static async accountGraphRequest<T>(workspaceId: string, method: "GET" | "POST" | "DELETE", path: string, data?: unknown, params?: Record<string, string>) {
        const account = await prisma.whatsAppAccount.findUnique({ where: { workspaceId } });
        if (!account) throw new Error("No hay cuenta de WhatsApp configurada.");
        const response = await axios.request<T>({ method, url: `${appConfig.graphBaseUrl}/${account.apiVersion}/${path}`, headers: { Authorization: `Bearer ${decryptSecret(account.accessToken)}` }, ...(data ? { data } : {}), ...(params ? { params } : {}), timeout: 20000, maxBodyLength: 1_500_000 });
        return response.data;
    }

    static async listFlows(workspaceId: string) {
        return this.accountGraphRequest<{ data?: unknown[] }>(workspaceId, "GET", `${await this.requireAccountId(workspaceId)}/flows`, undefined, { fields: "id,name,categories,status,health_status,validation_errors,updated_time" });
    }

    private static async requireAccountId(workspaceId: string): Promise<string> {
        const account = await prisma.whatsAppAccount.findUnique({ where: { workspaceId }, select: { businessAccountId: true } });
        if (!account) throw new Error("No hay cuenta de WhatsApp configurada.");
        return account.businessAccountId;
    }

    static async createFlow(workspaceId: string, input: { name: string; categories: string[]; flowJson?: Record<string, unknown>; publish?: boolean }) {
        const body: Record<string, unknown> = { name: input.name, categories: input.categories };
        if (input.flowJson) body.flow_json = input.flowJson;
        if (input.publish) body.publish = true;
        return this.accountGraphRequest(workspaceId, "POST", `${await this.requireAccountId(workspaceId)}/flows`, body);
    }

    static publishFlow(workspaceId: string, flowId: string) {
        return this.accountGraphRequest(workspaceId, "POST", `${encodeURIComponent(flowId)}/publish`, {});
    }

    static async listCatalogs(workspaceId: string) {
        return this.accountGraphRequest<{ data?: unknown[] }>(workspaceId, "GET", `${await this.requireAccountId(workspaceId)}/product_catalogs`, undefined, { fields: "id,name,vertical" });
    }

    static listCatalogProducts(workspaceId: string, catalogId: string) {
        return this.accountGraphRequest<{ data?: unknown[]; paging?: unknown }>(workspaceId, "GET", `${encodeURIComponent(catalogId)}/products`, undefined, { fields: "id,retailer_id,name,description,availability,price,currency,image_url,url" });
    }

    static async accountHealth(workspaceId: string) {
        const account = await prisma.whatsAppAccount.findUnique({ where: { workspaceId } });
        if (!account) throw new Error("No hay cuenta de WhatsApp configurada.");
        const accessToken = decryptSecret(account.accessToken);
        const base = `${appConfig.graphBaseUrl}/${account.apiVersion}/${account.businessAccountId}`;
        const [accountResult, appsResult] = await Promise.allSettled([
            axios.get(base, { params: { fields: "id,name,status,business_verification_status,health_status,whatsapp_business_manager_messaging_limit,currency" }, headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 }),
            axios.get(`${base}/subscribed_apps`, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 })
        ]);
        return {
            account: accountResult.status === "fulfilled" ? accountResult.value.data : null,
            subscribedApps: appsResult.status === "fulfilled" ? appsResult.value.data?.data || [] : [],
            accountError: accountResult.status === "rejected" ? this.metaError(accountResult.reason) : null,
            subscriptionsError: appsResult.status === "rejected" ? this.metaError(appsResult.reason) : null,
            checkedAt: new Date().toISOString()
        };
    }

    static async accountAnalytics(workspaceId: string, start: number, end: number) {
        const account = await prisma.whatsAppAccount.findUnique({ where: { workspaceId } });
        if (!account) throw new Error("No hay cuenta de WhatsApp configurada.");
        const accessToken = decryptSecret(account.accessToken);
        const base = `${appConfig.graphBaseUrl}/${account.apiVersion}/${account.businessAccountId}`;
        const params = { start, end, granularity: "DAILY", metric_types: "VOLUME,COST", dimensions: "PHONE,PRICING_CATEGORY" };
        const callParams = { start, end, granularity: "DAILY", metric_types: "COUNT,AVERAGE_DURATION,COST", dimensions: "PHONE,DIRECTION" };
        const [accountResult, pricingResult, callsResult] = await Promise.allSettled([
            axios.get(base, { params: { fields: "currency" }, headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 }),
            axios.get(`${base}/pricing_analytics`, { params, headers: { Authorization: `Bearer ${accessToken}` }, timeout: 20000 }),
            axios.get(`${base}/call_analytics`, { params: callParams, headers: { Authorization: `Bearer ${accessToken}` }, timeout: 20000 })
        ]);
        return {
            currency: accountResult.status === "fulfilled" ? String(accountResult.value.data?.currency || "") : "",
            start,
            end,
            pricing: pricingResult.status === "fulfilled" ? summarizeAnalytics(pricingResult.value.data, "pricing") : null,
            calls: callsResult.status === "fulfilled" ? summarizeAnalytics(callsResult.value.data, "calls") : null,
            pricingError: pricingResult.status === "rejected" ? this.metaError(pricingResult.reason) : null,
            callsError: callsResult.status === "rejected" ? this.metaError(callsResult.reason) : null,
            checkedAt: new Date().toISOString()
        };
    }

    private static metaError(error: unknown): string {
        if (axios.isAxiosError(error)) return error.response?.data?.error?.message || error.message;
        return error instanceof Error ? error.message : "No se pudo consultar Meta.";
    }

    static async blockUsers(workspaceId: string, numberId: string, method: "GET" | "POST" | "DELETE", users: string[] = []) {
        const number = await WhatsAppNumberService.getById(workspaceId, numberId);
        if (!number) throw new Error("Número de WhatsApp no encontrado.");
        const c = WhatsAppNumberService.credentialsFor(number);
        const response = await axios.request({
            method,
            url: `${appConfig.graphBaseUrl}/${c.apiVersion}/${c.phoneNumberId}/block_users`,
            headers: { Authorization: `Bearer ${c.accessToken}` },
            ...(method === "GET" ? {} : { data: buildBlockUsersPayload(users) }),
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
