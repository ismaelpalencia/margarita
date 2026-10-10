import assert from "node:assert/strict";
import test from "node:test";

import {
    generateSecrets,
    generateStrongPassword,
    mergeMissingEnv,
    parseEnvKeys
} from "./generate-secrets";

test("la contraseña cumple la política del proyecto", () => {
    for (let attempt = 0; attempt < 25; attempt++) {
        const password = generateStrongPassword();

        assert.equal(password.length, 20);
        assert.match(password, /[A-Za-z]/, "debe tener letras");
        assert.match(password, /[0-9]/, "debe tener números");
        assert.match(password, /[^A-Za-z0-9]/, "debe tener un símbolo");
    }
});

test("cada contraseña es distinta", () => {
    const generated = new Set(
        Array.from({ length: 50 }, () => generateStrongPassword())
    );

    assert.equal(generated.size, 50);
});

test("ENCRYPTION_KEY son 32 bytes en hexadecimal", () => {
    const secrets = generateSecrets();
    const encryptionKey = secrets.find((s) => s.key === "ENCRYPTION_KEY");

    assert.ok(encryptionKey);
    assert.match(encryptionKey!.value, /^[0-9a-f]{64}$/);
});

test("genera las cuatro claves que necesita una instalación", () => {
    const keys = generateSecrets().map((secret) => secret.key);

    assert.deepEqual(keys, [
        "ENCRYPTION_KEY",
        "JWT_SECRET",
        "META_VERIFY_TOKEN",
        "ADMIN_PASSWORD"
    ]);
});

test("parseEnvKeys detecta las claves ya definidas", () => {
    const keys = parseEnvKeys(
        [
            "# comentario",
            "DATABASE_URL=\"postgresql://localhost/db\"",
            "",
            "JWT_SECRET=abc",
            "  APP_URL=http://localhost:3000"
        ].join("\n")
    );

    assert.deepEqual(keys, ["DATABASE_URL", "JWT_SECRET", "APP_URL"]);
});

test("mergeMissingEnv agrega solo lo que falta", () => {
    const existing = "DATABASE_URL=postgresql://localhost/db\n";
    const secrets = [
        { key: "DATABASE_URL", value: "no-debe-cambiar", description: "" },
        { key: "ENCRYPTION_KEY", value: "abc123", description: "" }
    ];

    const result = mergeMissingEnv(existing, secrets);

    assert.deepEqual(result.added, ["ENCRYPTION_KEY"]);
    assert.deepEqual(result.skipped, ["DATABASE_URL"]);
    assert.ok(result.contents.includes("ENCRYPTION_KEY=abc123"));
    assert.ok(result.contents.includes("DATABASE_URL=postgresql://localhost/db"));
    assert.equal(result.contents.includes("no-debe-cambiar"), false);
});

test("mergeMissingEnv no altera el archivo si ya está todo", () => {
    const existing = "ENCRYPTION_KEY=ya-existe\nJWT_SECRET=ya-existe\n";
    const secrets = [
        { key: "ENCRYPTION_KEY", value: "nuevo", description: "" },
        { key: "JWT_SECRET", value: "nuevo", description: "" }
    ];

    const result = mergeMissingEnv(existing, secrets);

    assert.equal(result.contents, existing);
    assert.deepEqual(result.added, []);
    assert.deepEqual(result.skipped, ["ENCRYPTION_KEY", "JWT_SECRET"]);
});
