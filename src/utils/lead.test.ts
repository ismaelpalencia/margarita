import assert from "node:assert/strict";
import test from "node:test";

import { extractEmail } from "./lead";

test("extrae el correo de un texto", () => {
    assert.equal(extractEmail("mi correo es ana@empresa.mx gracias"), "ana@empresa.mx");
    assert.equal(extractEmail("ANA@Empresa.MX"), "ANA@Empresa.MX");
    assert.equal(extractEmail("sin correo"), null);
    assert.equal(extractEmail(""), null);
});