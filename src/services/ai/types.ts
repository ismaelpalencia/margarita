/**
 * Contrato mínimo del proveedor de IA.
 *
 * Es deliberadamente pequeño y compatible con la forma de OpenAI
 * (`/chat/completions`): así se puede cambiar de DeepSeek a OpenAI, Azure,
 * Groq u Ollama cambiando variables, sin tocar la lógica de la aplicación.
 */

export type AiChatMessage = {
    role: "system" | "user" | "assistant";
    content: string;
};

export type AiCompletionRequest = {
    system: string;
    messages: AiChatMessage[];
    maxTokens: number;
    temperature: number;
    /** Override del modelo configurado (por workspace). */
    model?: string;
};

export type AiCompletionResult = {
    text: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
};

export type AiProvider = {
    readonly name: string;
    /** ¿Tiene lo necesario para llamar? (por ejemplo, la llave). */
    isConfigured(): boolean;
    complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
};

export class AiProviderError extends Error {
    readonly status: number | null;
    readonly retryable: boolean;

    constructor(
        message: string,
        options: { status?: number | null; retryable?: boolean } = {}
    ) {
        super(message);
        this.name = "AiProviderError";
        this.status = options.status ?? null;
        this.retryable = options.retryable ?? false;
    }
}
