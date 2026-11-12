import assert from "node:assert/strict";
import test from "node:test";

import { buildLeadsCsv } from "./lead-csv";

test("exporta los campos del flujo en columnas separadas", () => {
    const csv = buildLeadsCsv([
        {
            id: "lead-1",
            email: "ana@example.com",
            name: "Ana",
            phone: "2221234567",
            interest: "Ortodoncia",
            fields: { servicio: "Ortodoncia", deudas: "Sí" },
            source: "GUIDED_FLOW",
            status: "NUEVO",
            createdAt: new Date("2026-11-11T12:00:00.000Z")
        },
        {
            id: "lead-2",
            email: null,
            name: "Luis",
            phone: "2227654321",
            interest: null,
            fields: { servicio: "Limpieza" },
            source: "MANUAL",
            status: "CONTACTADO",
            createdAt: new Date("2026-11-11T13:00:00.000Z")
        }
    ]);

    const [header, first, second] = csv.replace(/^\uFEFF/, "").split("\r\n");

    assert.match(header, /dato_deudas/);
    assert.match(header, /dato_servicio/);
    assert.doesNotMatch(header, /datos_flujo/);
    assert.match(first, /Ana/);
    assert.match(first, /Sí/);
    assert.match(first, /Ortodoncia/);
    assert.match(second, /Limpieza/);
    assert.match(second, /CONTACTADO/);
});

test("escapa comas y comillas en los datos del flujo", () => {
    const csv = buildLeadsCsv([
        {
            id: "lead-1",
            email: null,
            name: "Ana",
            phone: "2221234567",
            interest: null,
            fields: { nota: "Dijo \"sí\", pero pidió llamada" },
            source: "GUIDED_FLOW",
            status: "NUEVO",
            createdAt: new Date("2026-11-11T12:00:00.000Z")
        }
    ]);

    assert.match(csv, /"Dijo ""sí"", pero pidió llamada"/);
});
