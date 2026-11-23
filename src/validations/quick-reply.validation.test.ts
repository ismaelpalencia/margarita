import assert from "node:assert/strict";
import test from "node:test";

import { createQuickReplySchema } from "./quick-reply.validation";

test("las respuestas de texto existentes conservan el tipo TEXT por defecto", () => {
    const parsed = createQuickReplySchema.parse({ title: "Saludo", body: "Hola, ¿cómo puedo ayudarte?" });
    assert.equal(parsed.type, "TEXT");
});

test("acepta botones válidos y limita su cantidad y longitud", () => {
    const valid = createQuickReplySchema.safeParse({ type: "BUTTONS", title: "Confirmación", body: "¿Te parece bien?", buttons: ["Sí", "Necesito cambiar"] });
    assert.equal(valid.success, true);
    assert.equal(createQuickReplySchema.safeParse({ type: "BUTTONS", title: "Confirmación", body: "¿Te parece bien?", buttons: ["Uno", "Dos", "Tres", "Cuatro"] }).success, false);
    assert.equal(createQuickReplySchema.safeParse({ type: "BUTTONS", title: "Confirmación", body: "¿Te parece bien?", buttons: ["Una opción demasiado larga"] }).success, false);
});

test("acepta listas de hasta diez opciones con títulos y descripciones acotados", () => {
    const valid = createQuickReplySchema.safeParse({ type: "LIST", title: "Elegir horario", body: "¿Cuándo te queda bien?", buttonLabel: "Ver horarios", rows: [{ title: "Mañana", description: "De 9 a 12" }] });
    assert.equal(valid.success, true);
    assert.equal(createQuickReplySchema.safeParse({ type: "LIST", title: "Elegir horario", body: "¿Cuándo te queda bien?", buttonLabel: "Ver horarios", rows: Array.from({ length: 11 }, (_, index) => ({ title: `Opción ${index}` })) }).success, false);
});
