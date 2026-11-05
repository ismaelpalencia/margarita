import assert from "node:assert/strict";
import test from "node:test";

import { buildSystemPrompt } from "../services/ai/prompt";
import { detectLanguage, resolveReplyLanguage } from "./language";

test("detecta español, inglés y portugués", () => {
    assert.equal(detectLanguage("Hola, ¿cuál es el horario?"), "es");
    assert.equal(detectLanguage("Hello, what are your opening hours?"), "en");
    assert.equal(detectLanguage("Olá, qual é o horário de funcionamento?"), "pt");
});

test("ante duda o texto vacío, español", () => {
    assert.equal(detectLanguage(""), "es");
    assert.equal(detectLanguage("12345"), "es");
});

test("resolveReplyLanguage respeta los idiomas habilitados", () => {
    assert.equal(resolveReplyLanguage([], "en"), "es");
    assert.equal(resolveReplyLanguage(["en"], "en"), "en");
    assert.equal(resolveReplyLanguage(["pt"], "en"), "es");
    assert.equal(resolveReplyLanguage(["en", "pt"], "pt"), "pt");
    assert.equal(resolveReplyLanguage(["en"], "es"), "es");
});

test("el prompt incluye el idioma de respuesta", () => {
    const prompt = buildSystemPrompt({
        workspaceName: "Demo",
        settings: { language: "es-MX" },
        knowledge: [{ question: "¿Horario?", answer: "9 a 18" }],
        replyLanguage: "inglés"
    });

    assert.match(prompt, /Escribe en inglés/);
});