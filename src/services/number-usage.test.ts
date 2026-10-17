import assert from "node:assert/strict";
import test from "node:test";

import { buildNumberUsage, classifyUsageRow } from "./number-usage.service";

const numbers = [
    {
        id: "num_1",
        displayName: "Ventas",
        phoneNumber: "5215500000001",
        isActive: true,
        messagingLimit: "1K"
    },
    {
        id: "num_2",
        displayName: null,
        phoneNumber: "5215500000002",
        isActive: true,
        messagingLimit: "1K"
    }
];

const rates = { service: 0.05, utility: 0.03, marketing: 0.08 };

test("el servicio va al tramo y las plantillas a su tarifa", () => {
    const [first] = buildNumberUsage({
        numbers: [numbers[0]],
        rows: [
            { numberId: "num_1", type: "TEXT", category: "", total: 900 },
            { numberId: "num_1", type: "TEMPLATE", category: "UTILITY", total: 100 },
            { numberId: "num_1", type: "TEMPLATE", category: "MARKETING", total: 10 }
        ],
        limit: 1000,
        rates,
        currency: "USD",
        alertPercent: 80
    });

    assert.equal(first.service.used, 900, "solo el texto cuenta al tramo");
    assert.equal(first.service.remaining, 100);
    assert.equal(first.service.percent, 90);
    assert.equal(first.alert, true, "90% pasa el umbral del 80%");
    assert.equal(first.utility.used, 100);
    assert.equal(first.utility.cost, 3);
    assert.equal(first.marketing.cost, 0.8);
    assert.equal(first.estimatedCost, 3.8, "sin pasarse del tramo no hay costo de servicio");
});

test("al pasarse del tramo, el excedente sí cuesta", () => {
    const [first] = buildNumberUsage({
        numbers: [numbers[0]],
        rows: [{ numberId: "num_1", type: "TEXT", category: "", total: 1200 }],
        limit: 1000,
        rates,
        currency: "USD",
        alertPercent: 80
    });

    assert.equal(first.service.remaining, 0);
    assert.equal(first.service.percent, 100, "la barra no pasa del 100%");
    assert.equal(first.service.cost, 10, "200 de excedente por 0.05");
});

test("un número sin actividad arranca en cero y no alerta", () => {
    const [, second] = buildNumberUsage({
        numbers,
        rows: [],
        limit: 1000,
        rates,
        currency: "USD",
        alertPercent: 80
    });

    assert.equal(second.service.used, 0);
    assert.equal(second.alert, false);
    assert.equal(second.displayName, "5215500000002", "sin nombre usa el número");
});

test("las plantillas sin categoría no se inventan tarifa", () => {
    assert.equal(
        classifyUsageRow({ numberId: "num_1", type: "TEMPLATE", category: "", total: 5 }),
        "otherTemplates"
    );
    assert.equal(
        classifyUsageRow({ numberId: "num_1", type: "IMAGE", category: "", total: 1 }),
        "service"
    );
});
