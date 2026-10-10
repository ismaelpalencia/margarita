import "dotenv/config";

import { runSeed } from "../src/tools/seed";

/**
 * Envoltorio para `npm run db:seed`.
 *
 * La implementación vive en `src/tools/seed.ts` para que también pueda
 * ejecutarse compilada dentro de Railway con `node dist/tools/seed.js`,
 * sin depender de tsx.
 */
runSeed()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error(
            "Error ejecutando seed:",
            error instanceof Error ? error.message : error
        );

        process.exit(1);
    });
