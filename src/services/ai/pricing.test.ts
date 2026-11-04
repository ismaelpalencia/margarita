import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    estimateCostMicros,
    formatUsdFromMicros,
    pricingForModel
} from "./pricing";

describe("estimateCostMicros", () => {
    it("calcula el costo de una respuesta corta en micro-USD", () => {
        /**
         * 1,000 de entrada a $0.27/1M = 270 micros.
         * 500 de salida a $1.10/1M = 550 micros.
         */
        assert.equal(
            estimateCostMicros({
                model: "deepseek-chat",
                promptTokens: 1000,
                completionTokens: 500
            }),
            820
        );
    });

    it("no redondea a cero las llamadas más baratas", () => {
        assert.ok(
            estimateCostMicros({
                model: "deepseek-chat",
                promptTokens: 50,
                completionTokens: 30
            }) > 0
        );
    });

    it("usa las tarifas de la instalación para modelos desconocidos", () => {
        const pricing = pricingForModel("modelo-propio");

        assert.ok(pricing.inputPerMillion > 0);
        assert.ok(pricing.outputPerMillion > 0);
    });

    it("formatea micro-USD como dólares con cuatro decimales", () => {
        assert.equal(formatUsdFromMicros(12_500), "$0.0125");
        assert.equal(formatUsdFromMicros(0), "$0.0000");
    });
});
