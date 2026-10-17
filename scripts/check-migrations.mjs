#!/usr/bin/env node
/**
 * Auditoría de migraciones.
 *
 * Falla si una migración borra o cambia algo de forma irreversible **sin**
 * haber sido revisada a mano. En una instalación por cliente, una migración
 * destructiva no se deshace con un rollback de código: corre contra la base y
 * el esquema queda cambiado.
 *
 * Cómo aprobar una migración destructiva a propósito:
 *   1. Escribe `-- revisado: <motivo>` en la primera línea del `migration.sql`.
 *   2. Documenta el respaldo previo en el PR.
 *
 * Uso: node scripts/check-migrations.mjs
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "prisma", "migrations");
const MARKER = /^--\s*revisado:/i;

/** Operaciones que no se pueden deshacer con código. */
const DESTRUCTIVE = [
    { pattern: /\bDROP\s+TABLE\b/i, label: "borra una tabla" },
    { pattern: /\bDROP\s+COLUMN\b/i, label: "borra una columna" },
    { pattern: /\bTRUNCATE\b/i, label: "vacía una tabla" },
    { pattern: /\bDELETE\s+FROM\b/i, label: "borra filas" },
    { pattern: /\bRENAME\s+(TABLE|COLUMN)\b/i, label: "renombra" },
    {
        pattern: /\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i,
        label: "cambia el tipo de una columna"
    }
];

if (!fs.existsSync(ROOT)) {
    console.error(`No existe ${ROOT}`);
    process.exit(1);
}

const problems = [];

for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
        continue;
    }

    const file = path.join(ROOT, entry.name, "migration.sql");

    if (!fs.existsSync(file)) {
        continue;
    }

    const sql = fs.readFileSync(file, "utf8");
    const firstLine = sql.split("\n").find((line) => line.trim()) || "";
    const reviewed = MARKER.test(firstLine.trim());

    for (const rule of DESTRUCTIVE) {
        if (rule.pattern.test(sql) && !reviewed) {
            problems.push(`${entry.name}: ${rule.label} y no tiene "-- revisado: …"`);
        }
    }
}

if (problems.length > 0) {
    console.error("Migraciones destructivas sin revisar:\n");

    for (const problem of problems) {
        console.error(`  ✖ ${problem}`);
    }

    console.error(
        "\nSi el cambio es intencional, agrega `-- revisado: <motivo>` como primera línea\n" +
            "del migration.sql y documenta el respaldo previo en el PR."
    );
    process.exit(1);
}

console.log("Migraciones revisadas: ninguna operación destructiva sin aprobar.");
