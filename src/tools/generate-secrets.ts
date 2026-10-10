import "dotenv/config";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Genera los secretos que necesita una instalación de Margarita.
 *
 * Uso:
 *   npm run secrets:generate                 # solo los muestra
 *   npm run secrets:generate -- --write-env  # además los agrega a .env
 *   npm run secrets:generate -- --json       # salida para automatizar
 *
 * Nunca sobrescribe valores existentes: en `--write-env` solo agrega las
 * claves que faltan.
 */

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*+-_=";

const PASSWORD_ALPHABET = LETTERS + DIGITS + SYMBOLS;

export type GeneratedSecret = {
    key: string;
    value: string;
    description: string;
};

function pickFrom(alphabet: string): string {
    return alphabet[crypto.randomInt(0, alphabet.length)];
}

/**
 * Contraseña con al menos una letra, un número y un símbolo, que cumple
 * la política mínima del proyecto.
 */
export function generateStrongPassword(length = 20): string {
    const characters = [
        pickFrom(LETTERS),
        pickFrom(DIGITS),
        pickFrom(SYMBOLS)
    ];

    while (characters.length < length) {
        characters.push(pickFrom(PASSWORD_ALPHABET));
    }

    for (let index = characters.length - 1; index > 0; index--) {
        const swapWith = crypto.randomInt(0, index + 1);

        [characters[index], characters[swapWith]] = [
            characters[swapWith],
            characters[index]
        ];
    }

    return characters.join("");
}

export function generateSecrets(): GeneratedSecret[] {
    return [
        {
            key: "ENCRYPTION_KEY",
            value: crypto.randomBytes(32).toString("hex"),
            description:
                "Cifra los tokens de Meta guardados en la base (AES-256-GCM)."
        },
        {
            key: "JWT_SECRET",
            value: crypto.randomBytes(48).toString("hex"),
            description: "Firma las cookies de sesión del panel."
        },
        {
            key: "META_VERIFY_TOKEN",
            value: `mg_${crypto.randomBytes(18).toString("base64url")}`,
            description:
                "Se pega también en Meta para verificar el webhook. No es un secreto crítico, pero no debe ser adivinable."
        },
        {
            key: "ADMIN_PASSWORD",
            value: generateStrongPassword(),
            description:
                "Contraseña del admin. La usa el seed para crear tu usuario."
        }
    ];
}

/** Claves presentes en un archivo .env (sin interpretar los valores). */
export function parseEnvKeys(contents: string): string[] {
    return contents
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1])
        .filter((key): key is string => Boolean(key));
}

/**
 * Agrega al archivo solo las claves que no existen. Devuelve el contenido
 * nuevo junto con las claves agregadas y las respetadas.
 */
export function mergeMissingEnv(
    contents: string,
    secrets: GeneratedSecret[]
): { contents: string; added: string[]; skipped: string[] } {
    const existing = new Set(parseEnvKeys(contents));
    const added: string[] = [];
    const skipped: string[] = [];

    const lines: string[] = [];

    for (const secret of secrets) {
        if (existing.has(secret.key)) {
            skipped.push(secret.key);
            continue;
        }

        lines.push(`${secret.key}=${secret.value}`);
        added.push(secret.key);
    }

    if (lines.length === 0) {
        return { contents, added, skipped };
    }

    const base = contents.endsWith("\n") || contents === "" ? contents : `${contents}\n`;
    const block = [
        "",
        "# Generado por `npm run secrets:generate`",
        ...lines,
        ""
    ].join("\n");

    return {
        contents: base + block,
        added,
        skipped
    };
}

function main() {
    const args = process.argv.slice(2);
    const asJson = args.includes("--json");
    const writeEnv = args.includes("--write-env");
    const envPath = (() => {
        if (!writeEnv) {
            return null;
        }

        const index = args.indexOf("--write-env");
        const candidate = args[index + 1];

        return candidate && !candidate.startsWith("--")
            ? path.resolve(process.cwd(), candidate)
            : path.resolve(process.cwd(), ".env");
    })();

    const secrets = generateSecrets();

    if (asJson) {
        console.log(
            JSON.stringify(
                Object.fromEntries(secrets.map((s) => [s.key, s.value])),
                null,
                2
            )
        );
        return;
    }

    console.log("\nSecretos generados para esta instalación:\n");

    for (const secret of secrets) {
        console.log(`${secret.key}=${secret.value}`);
        console.log(`    ↳ ${secret.description}\n`);
    }

    console.log(
        "Pégalos en el archivo .env de tu máquina y en las Variables del servicio en Railway."
    );
    console.log(
        "Después pega META_VERIFY_TOKEN en Meta (WhatsApp → Configuración → Webhooks)."
    );
    console.log(
        "Entra al panel con el correo ADMIN_EMAIL y la ADMIN_PASSWORD que acabas de generar.\n"
    );

    if (!envPath) {
        return;
    }

    const exists = fs.existsSync(envPath);
    const current = exists ? fs.readFileSync(envPath, "utf8") : "";
    const result = mergeMissingEnv(current, secrets);

    if (result.added.length > 0) {
        fs.writeFileSync(envPath, result.contents, "utf8");
    }

    console.log(`Archivo: ${envPath}`);

    if (result.added.length > 0) {
        console.log(`  Agregadas: ${result.added.join(", ")}`);
    }

    if (result.skipped.length > 0) {
        console.log(
            `  Respetadas (ya existían, no se tocaron): ${result.skipped.join(", ")}`
        );
        console.log(
            "  Si ya tenías ENCRYPTION_KEY, NO la cambies: los tokens cifrados dejarían de leerse."
        );
    }

    if (result.added.length === 0) {
        console.log("  No había nada que agregar.");
    }
}

if (require.main === module) {
    main();
}
