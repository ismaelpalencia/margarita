import assert from "node:assert/strict";
import test from "node:test";

import { renderMarkdown, slugify } from "./markdown";

test("los títulos llevan identificador para las anclas", () => {
    const { html, headings } = renderMarkdown("## 1. Antes de la primera sesión");

    assert.equal(headings[0].id, "1-antes-de-la-primera-sesion");
    assert.match(html, /<h2 id="1-antes-de-la-primera-sesion">/);
});

test("los acentos no rompen el identificador", () => {
    assert.equal(slugify("En qué quedó cada cliente"), "en-que-quedo-cada-cliente");
});

test("las tablas se convierten en tabla de verdad", () => {
    const { html } = renderMarkdown(
        ["| Resultado | Pide |", "| --- | --- |", "| Promesa | Monto |"].join("\n")
    );

    assert.match(html, /<table>/);
    assert.match(html, /<th>Resultado<\/th>/);
    assert.match(html, /<td>Promesa<\/td>/);
});

test("listas ordenadas y con viñetas", () => {
    const { html } = renderMarkdown("- uno\n- dos\n\n1. primero\n2. segundo");

    assert.match(html, /<ul><li>uno<\/li><li>dos<\/li><\/ul>/);
    assert.match(html, /<ol><li>primero<\/li><li>segundo<\/li><\/ol>/);
});

test("un renglón partido no reinicia la numeración", () => {
    const { html } = renderMarkdown(
        "1. Abre la dirección y espera\n   a que cargue.\n2. Entra con tu correo."
    );

    assert.equal((html.match(/<ol>/g) || []).length, 1);
    assert.match(html, /Abre la dirección y espera a que cargue\./);
});

test("negritas, código y enlaces", () => {
    const { html } = renderMarkdown(
        "Usa **esto** con `código` y [la guía](/guia)."
    );

    assert.match(html, /<strong>esto<\/strong>/);
    assert.match(html, /<code>código<\/code>/);
    assert.match(html, /<a href="\/guia"/);
});

test("no se cuelan enlaces peligrosos ni HTML", () => {
    const { html } = renderMarkdown(
        "[x](javascript:alert(1)) y <script>alert(1)</script>"
    );

    assert.doesNotMatch(html, /javascript:/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
});

test("las citas y los bloques de código se respetan", () => {
    const { html } = renderMarkdown("> ojo\n\n```bash\nnpm test\n```");

    assert.match(html, /<blockquote>ojo<\/blockquote>/);
    assert.match(html, /<pre><code class="language-bash">npm test<\/code><\/pre>/);
});
