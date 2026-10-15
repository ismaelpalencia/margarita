import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { appConfig } from "../config/app.config";
import {
    DATE_FIELDS,
    TableName,
    BackupFileService
} from "../services/backup-file.service";
import { decodeSnapshot, humanSize } from "../utils/backup-format";

/**
 * Restaura un respaldo sobre la base actual.
 *
 * Es destructivo: borra todas las filas de las tablas del respaldo y las
 * reemplaza por las del archivo. Por eso exige `--yes`.
 *
 *   npm run db:restore -- --file=margarita-2026-10-15-0300.mgb --dry-run
 *   npm run db:restore -- --file=/ruta/completo.mgb --yes
 */

function argValue(name: string): string | null {
    const prefix = `--${name}=`;
    const found = process.argv.find((value) => value.startsWith(prefix));

    return found ? found.slice(prefix.length) : null;
}

function hasFlag(name: string): boolean {
    return process.argv.includes(`--${name}`);
}

/** Texto ISO → Date, solo en los campos que son fecha de verdad. */
function reviveDates(table: TableName, rows: unknown[]): unknown[] {
    const fields = DATE_FIELDS[table] ?? [];

    return rows.map((row) => {
        const copy = { ...(row as Record<string, unknown>) };

        for (const field of fields) {
            const value = copy[field];

            if (typeof value === "string") {
                copy[field] = new Date(value);
            }
        }

        return copy;
    });
}

function chunk<T>(items: T[], size: number): T[][] {
    const result: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
        result.push(items.slice(index, index + size));
    }

    return result;
}

async function main() {
    const connectionString = process.env.DATABASE_URL?.trim();

    if (!connectionString) {
        throw new Error("DATABASE_URL no está definido.");
    }

    const requested = argValue("file");

    if (!requested) {
        throw new Error(
            "Indica el archivo: npm run db:restore -- --file=<archivo.mgb>"
        );
    }

    const full = path.isAbsolute(requested)
        ? requested
        : fs.existsSync(requested)
          ? requested
          : path.join(path.resolve(appConfig.backupDir), requested);

    if (!fs.existsSync(full)) {
        throw new Error(`No existe el archivo ${full}.`);
    }

    const stats = fs.statSync(full);
    const payload = decodeSnapshot(fs.readFileSync(full, "utf8"));

    const totalRows = Object.values(payload.counts).reduce(
        (sum, value) => sum + value,
        0
    );

    console.log("[restaurar] Archivo:", path.basename(full));
    console.log("[restaurar] Creado:", payload.createdAt);
    console.log(
        "[restaurar] Tamaño:",
        humanSize(stats.size),
        "·",
        totalRows,
        "filas en total"
    );

    for (const table of BackupFileService.tables()) {
        console.log(
            `  ${table}: ${payload.counts[table] ?? 0} fila(s)`
        );
    }

    if (hasFlag("dry-run")) {
        console.log(
            "\n[restaurar] Simulación: el archivo se pudo leer y descifrar. No se tocó la base."
        );
        return;
    }

    const confirmed =
        hasFlag("yes") || (process.env.RESTORE_CONFIRM || "").toUpperCase() === "SI";

    if (!confirmed) {
        console.log(
            "\n[restaurar] Se van a BORRAR todos los datos actuales y se reemplazarán " +
                "por los del respaldo.\nSi es lo que quieres, vuelve a correrlo con --yes."
        );
        process.exitCode = 1;
        return;
    }

    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString })
    });

    try {
        const tables = BackupFileService.tables();

        console.log("\n[restaurar] Borrando datos actuales (de hijos a padres)…");

        for (const table of [...tables].reverse()) {
            const delegate = delegateFor(prisma, table);
            const deleted = await delegate.deleteMany();

            if (deleted.count > 0) {
                console.log(`  ${table}: ${deleted.count} borradas`);
            }
        }

        console.log("[restaurar] Insertando el respaldo (de padres a hijos)…");

        for (const table of tables) {
            const rows = reviveDates(table, payload.tables[table] ?? []);

            if (rows.length === 0) {
                continue;
            }

            const delegate = delegateFor(prisma, table);

            /** En lotes: una sola inserción gigante revienta el límite de parámetros. */
            for (const batch of chunk(rows, 500)) {
                await delegate.createMany({ data: batch });
            }

            console.log(`  ${table}: ${rows.length} insertadas`);
        }

        console.log("\n[restaurar] Listo. La base quedó como el respaldo.");
        console.log(
            "[restaurar] Si el proceso se interrumpe a la mitad, la base queda " +
                "incompleta: vuelve a correr el mismo comando con el mismo archivo y " +
                "se completa (borra y recarga, así que es repetible)."
        );
    } finally {
        await prisma.$disconnect();
    }
}

type Delegate = {
    deleteMany: () => Promise<{ count: number }>;
    createMany: (args: unknown) => Promise<unknown>;
};

function delegateFor(client: PrismaClient, table: TableName): Delegate {
    const key = table.charAt(0).toLowerCase() + table.slice(1);

    return (client as unknown as Record<string, Delegate>)[key];
}

main().catch((error) => {
    console.error(
        "[restaurar] Error:",
        error instanceof Error ? error.message : error
    );

    process.exit(1);
});
