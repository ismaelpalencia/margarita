import assert from "node:assert/strict";
import test from "node:test";

import { toCsv } from "./csv";

test("genera encabezado y filas", () => {
    const csv = toCsv(
        [
            { nombre: "Ana", edad: 30 },
            { nombre: "Beto", edad: 25 }
        ],
        ["nombre", "edad"]
    );

    assert.equal(csv, "\uFEFFnombre,edad\r\nAna,30\r\nBeto,25\r\n");
});

test("escapa comas, comillas y saltos de línea", () => {
    const csv = toCsv(
        [{ texto: 'Dijo "hola", y se fue', multilinea: "linea1\nlinea2" }],
        ["texto", "multilinea"]
    );

    assert.match(csv, /"Dijo ""hola"", y se fue"/);
    assert.match(csv, /"linea1\nlinea2"/);
});

test("neutraliza fórmulas al inicio (Excel)", () => {
    const csv = toCsv([{ valor: "=1+1" }], ["valor"]);

    assert.match(csv, /"=1\+1"/);
});

test("los valores vacíos quedan en blanco", () => {
    const csv = toCsv([{ a: null, b: undefined, c: "" }], ["a", "b", "c"]);

    assert.equal(csv, "\uFEFFa,b,c\r\n,,\r\n");
});

test("serializa fechas en ISO y objetos en JSON", () => {
    const csv = toCsv(
        [
            {
                fecha: new Date("2024-03-05T12:00:00.000Z"),
                datos: { pedido: "A-1" }
            }
        ],
        ["fecha", "datos"]
    );

    assert.match(csv, /2024-03-05T12:00:00.000Z/);
    assert.match(csv, /"\{""pedido"":""A-1""\}"/);
});

test("sin filas solo devuelve el encabezado", () => {
    assert.equal(toCsv([], ["a", "b"]), "\uFEFFa,b\r\n");
});
