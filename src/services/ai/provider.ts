import { appConfig } from "../../config/app.config";
import {
    AiCompletionRequest,
    AiCompletionResult,
    AiProvider,
    AiProviderError
} from "./types";

type OpenAiChatResponse = {
    model?: string;
    choices?: Array<{
        message?: {
            content?: string | null;
        };
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
    };
    error?: {
        message?: string;
    };
};

function endpoint(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Proveedor compatible con OpenAI (`POST /chat/completions`).
 *
 * DeepSeek es el valor por defecto. La misma clase sirve para OpenAI, Azure
 * OpenAI, Groq, OpenRouter o un Ollama local: lo único que cambia es
 * `AI_BASE_URL`, `AI_API_KEY` y `AI_MODEL`.
 */
class OpenAiCompatibleProvider implements AiProvider {
    readonly name: string;

    constructor(name = "openai-compatible") {
        this.name = name;
    }

    isConfigured(): boolean {
        return appConfig.ai.apiKey.length > 0;
    }

    async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
        if (!this.isConfigured()) {
            throw new AiProviderError(
                "Falta AI_API_KEY. Configúrala en las variables de entorno para que la IA pueda responder.",
                { retryable: false }
            );
        }

        const model = request.model?.trim() || appConfig.ai.model;

        const body = {
            model,
            messages: [
                { role: "system" as const, content: request.system },
                ...request.messages
            ],
            temperature: request.temperature,
            max_tokens: request.maxTokens,
            stream: false,
            /**
             * DeepSeek y la mayoría de los proveedores compatibles aceptan
             * este modo. El prompt ya pide JSON; esto lo refuerza.
             */
            response_format: { type: "json_object" as const }
        };

        let lastError: unknown = null;

        /** Un reintento solo para fallos de red, 429 y 5xx. Nunca para 4xx. */
        for (let attempt = 1; attempt <= 2; attempt += 1) {
            const startedAt = Date.now();

            try {
                const controller = new AbortController();
                const timer = setTimeout(
                    () => controller.abort(),
                    appConfig.ai.timeoutMs
                );

                let response: Response;

                try {
                    response = await fetch(
                        endpoint(appConfig.ai.baseUrl, "chat/completions"),
                        {
                            method: "POST",
                            headers: {
                                Authorization: `Bearer ${appConfig.ai.apiKey}`,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify(body),
                            signal: controller.signal
                        }
                    );
                } finally {
                    clearTimeout(timer);
                }

                const raw = await response.text();
                let parsed: OpenAiChatResponse = {};

                try {
                    parsed = raw ? (JSON.parse(raw) as OpenAiChatResponse) : {};
                } catch {
                    parsed = {};
                }

                if (!response.ok) {
                    const detail =
                        parsed.error?.message ||
                        raw.slice(0, 300) ||
                        response.statusText;

                    throw new AiProviderError(
                        `El proveedor de IA respondió ${response.status}: ${detail}`,
                        {
                            status: response.status,
                            /** 429 y 5xx se reintentan; el resto no. */
                            retryable:
                                response.status === 429 ||
                                response.status >= 500
                        }
                    );
                }

                const text = parsed.choices?.[0]?.message?.content ?? "";

                if (!text.trim()) {
                    throw new AiProviderError(
                        "El proveedor de IA devolvió una respuesta vacía.",
                        { retryable: true }
                    );
                }

                return {
                    text,
                    model: parsed.model || model,
                    promptTokens: parsed.usage?.prompt_tokens ?? 0,
                    completionTokens: parsed.usage?.completion_tokens ?? 0,
                    latencyMs: Date.now() - startedAt
                };
            } catch (error) {
                const normalized =
                    error instanceof AiProviderError
                        ? error
                        : new AiProviderError(
                              error instanceof Error &&
                                  error.name === "AbortError"
                                  ? `El proveedor de IA tardó más de ${appConfig.ai.timeoutMs} ms.`
                                  : `No se pudo llamar al proveedor de IA: ${
                                        error instanceof Error
                                            ? error.message
                                            : String(error)
                                    }`,
                              { retryable: true }
                          );

                lastError = normalized;

                if (!normalized.retryable || attempt === 2) {
                    throw normalized;
                }

                await sleep(500 * attempt);
            }
        }

        throw lastError instanceof Error
            ? lastError
            : new AiProviderError("No se pudo llamar al proveedor de IA.");
    }
}

/**
 * Proveedor de pruebas: sin red y determinista.
 *
 * Devuelve el mismo JSON que se le pide al modelo real, así que ejercita el
 * mismo camino (parseo, umbral de confianza, handoff). Se activa con
 * `AI_PROVIDER=mock`.
 */
class MockProvider implements AiProvider {
    readonly name = "mock";

    isConfigured(): boolean {
        return true;
    }

    async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
        const lastUser = [...request.messages]
            .reverse()
            .find((message) => message.role === "user");

        const text = (lastUser?.content || "").toLowerCase();

        if (/(persona|humano|asesor|queja|reclamo)/.test(text)) {
            return this.result({
                reply: "",
                confidence: 0.96,
                intent: "hablar_con_persona",
                handoff: true,
                reason: "El cliente pidió hablar con una persona."
            });
        }

        if (/(horario|abren|cierran|a que hora)/.test(text)) {
            return this.result({
                reply: "Nuestro horario es de lunes a viernes, de 9:00 a 18:00.",
                confidence: 0.93,
                intent: "horario",
                handoff: false,
                reason: "La respuesta está en la base de conocimiento."
            });
        }

        if (/(precio|cuesta|cuanto|descuento)/.test(text)) {
            return this.result({
                reply: "",
                confidence: 0.35,
                intent: "precio",
                handoff: true,
                reason: "El precio no está en la base de conocimiento."
            });
        }

        if (/(ubicacion|donde estan|direccion|domicilio)/.test(text)) {
            return this.result({
                reply: "Estamos en la dirección que aparece en nuestra ficha de contacto.",
                confidence: 0.72,
                intent: "ubicacion",
                handoff: false,
                reason: "La respuesta está en la base de conocimiento."
            });
        }

        return this.result({
            reply: "Gracias por escribir. En un momento te atendemos.",
            confidence: 0.3,
            intent: "general",
            handoff: false,
            reason: "No hay una entrada de conocimiento que cubra la pregunta."
        });
    }

    private result(payload: {
        reply: string;
        confidence: number;
        intent: string;
        handoff: boolean;
        reason: string;
    }): AiCompletionResult {
        return {
            text: JSON.stringify(payload),
            model: "mock",
            promptTokens: 0,
            completionTokens: 0,
            latencyMs: 1
        };
    }
}

const mockProvider = new MockProvider();
const compatibleProvider = new OpenAiCompatibleProvider();

export function createAiProvider(): AiProvider {
    return appConfig.ai.provider === "mock"
        ? mockProvider
        : compatibleProvider;
}

/** ¿El proveedor tiene lo necesario para llamar? (sin mirar el interruptor). */
export function isProviderConfigured(): boolean {
    return createAiProvider().isConfigured();
}

/** ¿Hay interruptor, proveedor y credenciales para intentar una llamada? */
export function isAiConfigured(): boolean {
    if (!appConfig.ai.enabled) {
        return false;
    }

    return isProviderConfigured();
}

export function aiProviderLabel(): string {
    if (!appConfig.ai.enabled) {
        return "Apagada (AI_ENABLED=false)";
    }

    if (appConfig.ai.provider === "mock") {
        return "Mock de pruebas";
    }

    return `${appConfig.ai.provider} · ${appConfig.ai.model}`;
}
