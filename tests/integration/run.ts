import "dotenv/config";

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Corre las pruebas de integración.
 *
 * Levanta la aplicación de verdad (el `dist` compilado) en un puerto aparte,
 * porque varias pruebas hablan por HTTP: la firma del webhook solo se puede
 * verificar de punta a punta con el endpoint levantado.
 *
 * La app se apaga al terminar, pase lo que pase con las pruebas.
 *
 *   npm run test:integration
 *
 * Necesita: `npm run build` hecho y `DATABASE_URL` disponible. En CI la base
 * es desechable y se activan las pruebas destructivas con
 * `INTEGRATION_DESTRUCTIVE=1`.
 */

const PORT = Number(process.env.INTEGRATION_PORT || 3987);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Secreto de firma propio de las pruebas: nunca el de producción. Tiene la
 * forma del App Secret real (32 hexadecimales) para que la aplicación no
 * avise de un valor de relleno.
 */
const META_APP_SECRET =
    process.env.INTEGRATION_META_SECRET ||
    "0123456789abcdef0123456789abcdef";

function fail(message: string): never {
    console.error(`[integración] ${message}`);
    process.exit(1);
}

async function waitForServer(timeoutMs = 45000): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${BASE_URL}/health`);

            if (res.status === 200) {
                return;
            }
        } catch {
            /** Todavía no levanta. */
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    fail(`la aplicación no respondió en ${BASE_URL}/health en ${timeoutMs / 1000}s`);
}

async function main() {
    if (!process.env.DATABASE_URL?.trim()) {
        fail(
            "falta DATABASE_URL. Estas pruebas escriben en una base de datos real " +
                "(crean y borran su propia empresa de prueba)."
        );
    }

    if (!fs.existsSync(path.join(process.cwd(), "dist", "server.js"))) {
        fail("falta el build. Corre `npm run build` antes de las pruebas de integración.");
    }

    const logFile = path.join(os.tmpdir(), `margarita-integracion-${Date.now()}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: "a" });

    console.log(`[integración] Levantando la aplicación en ${BASE_URL}…`);

    const server = spawn("node", ["dist/server.js"], {
        env: {
            ...process.env,
            PORT: String(PORT),
            APP_URL: BASE_URL,
            META_APP_SECRET,
            NODE_ENV: "production",
            /**
             * Toda la suite entra desde 127.0.0.1, así que el tope de acceso
             * de producción (10 cada 15 minutos) la tumbaba sola: al probar
             * los archivos que inician sesión varias veces, el login acababa
             * respondiendo 429 y la prueba fallaba por una razón que no era
             * la suya. En producción el tope sigue igual: 10.
             */
            LOGIN_RATE_LIMIT_MAX: "500",
            HEALTH_TOKEN: "token-de-prueba",
            /** El webhook se encola: así se prueba el camino completo. */
            WEBHOOK_QUEUE_ENABLED: "true"
        },
        stdio: ["ignore", "pipe", "pipe"]
    });

    server.stdout.pipe(logStream);
    server.stderr.pipe(logStream);

    const stop = () => {
        if (!server.killed) {
            server.kill("SIGTERM");
        }

        logStream.end();
    };

    process.on("exit", stop);
    process.on("SIGINT", () => {
        stop();
        process.exit(130);
    });

    try {
        await waitForServer();

        console.log("[integración] Aplicación arriba. Corriendo pruebas…\n");

        const result = spawnSync(
            "node",
            [
                "--import",
                "tsx",
                "--test",
                "--test-concurrency=1",
                "tests/integration/*.test.ts"
            ],
            {
                env: {
                    ...process.env,
                    INTEGRATION_BASE_URL: BASE_URL,
                    META_APP_SECRET,
                    /**
                     * `test` deja el cliente de Prisma en silencio (solo
                     * registra consultas en `development`) y evita los avisos
                     * que la aplicación da cuando cree que está en producción.
                     */
                    NODE_ENV: "test"
                },
                stdio: "inherit"
            }
        );

        if (result.status !== 0) {
            console.error(
                `\n[integración] Pruebas fallidas. Log de la app: ${logFile}`
            );
        } else {
            console.log("\n[integración] Todo en verde.");
        }

        stop();
        process.exit(result.status ?? 1);
    } catch (error) {
        stop();
        throw error;
    }
}

main().catch((error) => {
    console.error(
        "[integración] Error:",
        error instanceof Error ? error.message : error
    );

    process.exit(1);
});
