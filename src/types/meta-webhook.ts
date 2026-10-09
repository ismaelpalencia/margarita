export type MetaWebhookPayload = {
    object?: string;
    entry?: MetaWebhookEntry[];
};

export type MetaWebhookEntry = {
    id?: string;
    changes?: MetaWebhookChange[];
};

export type MetaWebhookChange = {
    field?: string;
    value?: MetaWebhookValue;
};

export type MetaWebhookValue = {
    messaging_product?: string;
    metadata?: {
        display_phone_number?: string;
        phone_number_id?: string;
    };
    contacts?: MetaWebhookContact[];
    messages?: MetaWebhookMessage[];
    statuses?: MetaWebhookStatus[];
};

export type MetaWebhookContact = {
    profile?: {
        name?: string;
    };
    wa_id?: string;
};

export type MetaWebhookMessage = {
    from?: string;
    id?: string;
    timestamp?: string;
    type?: string;
    text?: {
        body?: string;
    };
    image?: {
        id?: string;
        mime_type?: string;
        sha256?: string;
        caption?: string;
    };
    video?: {
        id?: string;
        mime_type?: string;
        sha256?: string;
        caption?: string;
    };
    audio?: {
        id?: string;
        mime_type?: string;
        sha256?: string;
    };
    document?: {
        id?: string;
        mime_type?: string;
        sha256?: string;
        filename?: string;
        caption?: string;
    };
    interactive?: unknown;
    button?: unknown;
};

export type MetaWebhookStatus = {
    id?: string;
    status?: string;
    timestamp?: string;
    recipient_id?: string;
    errors?: unknown[];
};
