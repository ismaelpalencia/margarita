import { MetaWebhookPayload } from "../types/meta-webhook";

export function extractPhoneNumberId(
    payload: MetaWebhookPayload | null | undefined
): string | null {
    for (const entry of payload?.entry || []) {
        for (const change of entry?.changes || []) {
            const phoneNumberId = change?.value?.metadata?.phone_number_id;

            if (phoneNumberId) {
                return phoneNumberId;
            }
        }
    }

    return null;
}
