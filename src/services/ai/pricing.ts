import { appConfig } from "../../config/app.config";

/**
 * Estimación de costo de una llamada al modelo.
 *
 * Se guarda en **micro-USD** (millonésimas de dólar) porque una respuesta
 * corta cuesta fracciones de centavo: en centavos se redondearía a cero y
 * el presupuesto mensual nunca se movería.
 *
 * La tarifa es una referencia configurable. El cobro real lo hace el
 * proveedor y puede incluir caché o descuentos por horario.
 */

export type TokenPricing = {
    /** USD por millón de tokens de entrada. */
    inputPerMillion: number;
    /** USD por millón de tokens de salida. */
    outputPerMillion: number;
};

/**
 * Tarifas conocidas por modelo. Si el modelo no está aquí se usan las
 * variables `AI_PRICE_INPUT_PER_MILLION` / `AI_PRICE_OUTPUT_PER_MILLION`.
 */
const KNOWN_PRICING: Record<string, TokenPricing> = {
    "deepseek-chat": { inputPerMillion: 0.27, outputPerMillion: 1.1 },
    "deepseek-reasoner": { inputPerMillion: 0.55, outputPerMillion: 2.19 }
};

export function pricingForModel(model: string): TokenPricing {
    const known = KNOWN_PRICING[model.trim().toLowerCase()];

    if (known) {
        return known;
    }

    return {
        inputPerMillion: appConfig.ai.priceInputPerMillion,
        outputPerMillion: appConfig.ai.priceOutputPerMillion
    };
}

/**
 * `tokens * USD/1M` ya da micro-USD: 1,000 tokens a $0.27/1M son 270
 * millonésimas de dólar. Se redondea una sola vez, al final.
 */
export function estimateCostMicros(params: {
    model: string;
    promptTokens: number;
    completionTokens: number;
}): number {
    const pricing = pricingForModel(params.model);

    const prompt = Math.max(0, params.promptTokens) * pricing.inputPerMillion;
    const completion =
        Math.max(0, params.completionTokens) * pricing.outputPerMillion;

    return Math.round(prompt + completion);
}

/** Para mostrar en la interfaz: 12500 micros → "$0.0125". */
export function formatUsdFromMicros(costMicros: number): string {
    const usd = Math.max(0, costMicros) / 1_000_000;

    return `$${usd.toFixed(4)}`;
}
