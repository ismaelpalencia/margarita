import fs from "node:fs";
import path from "node:path";

import { renderMarkdown, RenderedMarkdown } from "../utils/markdown";

/**
 * Las guías tienen una sola fuente: los archivos `.md` de `docs/`.
 *
 * La app y el sitio estático leen de aquí, así que no pueden decir cosas
 * distintas. Se corta el encabezado del archivo (el título y la nota de dónde
 * está publicada) porque la página pone su propia portada.
 */
export type GuideKind = "uso" | "plantillas";

const FILES: Record<GuideKind, string> = {
    uso: "guia-uso.md",
    plantillas: "guia-plantillas.md"
};

const cache = new Map<GuideKind, RenderedMarkdown>();

export function loadGuide(kind: GuideKind): RenderedMarkdown {
    const cached = cache.get(kind);

    if (cached) {
        return cached;
    }

    const file = path.join(process.cwd(), "docs", FILES[kind]);
    const raw = fs.readFileSync(file, "utf8");
    const start = raw.search(/^## /m);
    const rendered = renderMarkdown(start === -1 ? raw : raw.slice(start));

    cache.set(kind, rendered);

    return rendered;
}
