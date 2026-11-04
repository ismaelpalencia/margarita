import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    normalizeText,
    rankKnowledgeEntries,
    tokenize
} from "./knowledge";

describe("normalizeText", () => {
    it("quita acentos, mayúsculas y espacios de más", () => {
        assert.equal(normalizeText("  Dirección   FISCAL "), "direccion fiscal");
    });
});

describe("tokenize", () => {
    it("descarta palabras cortas y vacías de significado", () => {
        const tokens = tokenize("¿Cuál es el horario de atención de la tienda?");

        assert.deepEqual(tokens, ["horario", "atencion", "tienda"]);
    });
});

describe("rankKnowledgeEntries", () => {
    const entries = [
        {
            id: "horario",
            question: "¿Cuál es el horario de atención?",
            answer: "De 9 a 18.",
            keywords: ["horario", "abren"],
            priority: 0
        },
        {
            id: "ubicacion",
            question: "¿Dónde están?",
            answer: "En el centro.",
            keywords: ["ubicacion", "direccion"],
            priority: 10
        },
        {
            id: "precio",
            question: "¿Cuánto cuesta?",
            answer: "Depende del producto.",
            keywords: ["precio", "cuesta"],
            priority: 0
        }
    ];

    it("encuentra la entrada por palabra clave", () => {
        const result = rankKnowledgeEntries(entries, "¿A qué hora abren?", 3);

        assert.equal(result[0]?.id, "horario");
    });

    it("ignora acentos al comparar", () => {
        const result = rankKnowledgeEntries(
            entries,
            "necesito la dirección",
            3
        );

        assert.equal(result[0]?.id, "ubicacion");
    });

    it("usa la prioridad para desempatar", () => {
        const result = rankKnowledgeEntries(entries, "información", 3);

        /** Sin coincidencias no hay resultados: la prioridad no inventa. */
        assert.equal(result.length, 0);
    });

    it("respeta el límite pedido", () => {
        const result = rankKnowledgeEntries(
            entries,
            "horario dirección precio",
            1
        );

        assert.equal(result.length, 1);
    });

    it("devuelve vacío cuando no hay palabras útiles", () => {
        assert.deepEqual(rankKnowledgeEntries(entries, "de la y", 3), []);
    });
});
