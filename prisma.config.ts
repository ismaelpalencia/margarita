import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * `prisma generate` y `prisma validate` no se conectan a ninguna base de
 * datos, pero Prisma exige que la configuración resuelva la URL antes de
 * ejecutarse (por ejemplo, durante el build de Railway o en CI, donde no
 * existen variables de entorno). Sin este relleno, el build falla con
 * `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL`.
 *
 * Los comandos que sí se conectan (migrate, db push, studio, seed) usan
 * siempre el valor real de DATABASE_URL.
 */
const FALLBACK_DATABASE_URL =
    "postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
    console.warn(
        "[prisma] DATABASE_URL no está definida: se usa un valor de relleno. " +
            "generate y validate funcionan igual, pero migrate, db push, studio y seed fallarán."
    );
}

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
        seed: "tsx prisma/seed.ts"
    },
    datasource: {
        url: databaseUrl || FALLBACK_DATABASE_URL
    }
});
