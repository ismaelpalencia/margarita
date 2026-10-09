import "dotenv/config";

import { execFileSync } from "node:child_process";

import { Client } from "pg";

/**
 * Aplica las migraciones de Prisma resolviendo automáticamente el caso
 * de una base que ya existía antes de que hubiera historial de
 * migraciones (creada con `db push`).
 *
 * Está pensado para correr DENTRO de Railway, donde DATABASE_URL es la
 * URL interna y no hace falta exponer la base a internet:
 *
 *   node dist/tools/deploy-migrations.js
 *
 * Es idempotente: se puede ejecutar en cada deploy.
 */

export const INIT_MIGRATION = "20261009000000_init";

export type DatabaseState = {
    migrationsTable: boolean;
    appTables: boolean;
};

export type MigrationPlan = "baseline" | "fresh" | "deploy-only";

/**
 * Decide qué hacer según el estado de la base:
 * - `fresh`: no hay nada, `migrate deploy` crea todo.
 * - `baseline`: ya hay tablas de la app pero no historial, hay que marcar
 *   la migración inicial como aplicada antes de desplegar.
 * - `deploy-only`: ya hay historial, solo se aplican las pendientes.
 */
export function decidePlan(state: DatabaseState): MigrationPlan {
    if (state.migrationsTable) {
        return "deploy-only";
    }

    if (state.appTables) {
        return "baseline";
    }

    return "fresh";
}

async function inspect(connectionString: string): Promise<DatabaseState> {
    const client = new Client({ connectionString });

    await client.connect();

    try {
        const result = await client.query<{ table_name: string }>(
            `select table_name
               from information_schema.tables
              where table_schema = 'public'
                and table_name in ('_prisma_migrations', 'Workspace')`
        );

        const names = result.rows.map((row) => row.table_name);

        return {
            migrationsTable: names.includes("_prisma_migrations"),
            appTables: names.includes("Workspace")
        };
    } finally {
        await client.end();
    }
}

function runPrisma(args: string[]) {
    console.log(`[migraciones] npx prisma ${args.join(" ")}`);

    try {
        execFileSync("npx", ["prisma", ...args], {
            stdio: "inherit",
            env: process.env
        });
    } catch {
        throw new Error(
            `Falló "npx prisma ${args.join(" ")}". Revisa la salida de arriba. ` +
                "Si el error es que no existe el comando prisma, significa que las " +
                "devDependencies no están instaladas en este entorno."
        );
    }
}

async function main() {
    const connectionString = process.env.DATABASE_URL?.trim();

    if (!connectionString) {
        console.error(
            "[migraciones] DATABASE_URL no está definida. En Railway se toma de las variables del servicio."
        );

        process.exit(1);
    }

    const before = await inspect(connectionString);
    const plan = decidePlan(before);

    console.log(
        `[migraciones] historial=${before.migrationsTable} tablas_de_la_app=${before.appTables} plan=${plan}`
    );

    if (plan === "baseline") {
        console.log(
            "[migraciones] La base ya tenía tablas pero sin historial de migraciones: " +
                "se marca la migración inicial como aplicada (no se vuelve a crear)."
        );

        runPrisma(["migrate", "resolve", "--applied", INIT_MIGRATION]);
    }

    if (plan === "fresh") {
        console.log(
            "[migraciones] Base vacía: se aplicará todo el esquema desde cero."
        );
    }

    runPrisma(["migrate", "deploy"]);

    const after = await inspect(connectionString);

    if (!after.migrationsTable) {
        console.error(
            "[migraciones] Las migraciones no quedaron registradas en _prisma_migrations."
        );

        process.exit(1);
    }

    console.log(
        "[migraciones] Listo. La base quedó al día; el worker de webhooks se reactiva solo."
    );
}

if (require.main === module) {
    main().catch((error) => {
        console.error(
            "[migraciones] Error:",
            error instanceof Error ? error.message : error
        );

        process.exit(1);
    });
}
