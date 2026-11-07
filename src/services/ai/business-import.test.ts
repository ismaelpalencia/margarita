import assert from "node:assert/strict";
import test from "node:test";

import {
    BusinessImportData,
    normalizeBusinessImport
} from "./business-import.service";

const base: BusinessImportData = {
    business: {
        name: "Clínica Sonrisa",
        description: "Clínica dental en CDMX.",
        tone: "Cercano"
    },
    knowledge: [
        {
            question: "¿Cuánto cuesta una limpieza?",
            answer: "La limpieza cuesta $800.",
            keywords: ["limpieza", "precio"],
            buttons: ["Agendar cita"]
        }
    ],
    flows: [
        {
            name: "Agendar",
            trigger: "cita|agendar",
            reply: "Elige una opción.",
            buttons: ["Mañana", "Tarde"],
            list: null
        }
    ],
    handoffKeywords: ["queja"]
};

test("normaliza botones de conocimiento y flujos", () => {
    const result = normalizeBusinessImport(base);

    assert.equal(result.knowledge[0].buttons?.[0].title, "Agendar cita");
    assert.equal(result.flows[0].buttons?.length, 2);
    assert.equal(result.flows[0].slug, "agendar");
    assert.deepEqual(result.handoffKeywords, ["queja"]);
});

test("normaliza listas con IDs de fila", () => {
    const result = normalizeBusinessImport({
        ...base,
        flows: [
            {
                name: "Catálogo",
                trigger: "catalogo",
                reply: "Elige un producto.",
                buttons: [],
                list: {
                    buttonLabel: "Ver opciones",
                    sectionTitle: "Catálogo",
                    rows: [
                        { title: "Producto A", description: "Descripción" },
                        { title: "Producto B", description: "" }
                    ]
                }
            }
        ]
    });

    assert.deepEqual(result.flows[0].list?.rows.map((row) => row.id), [
        "ROW_1",
        "ROW_2"
    ]);
});
