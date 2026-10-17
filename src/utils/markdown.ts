/**
 * Renderizador de Markdown del proyecto.
 *
 * Es a propósito pequeño: solo cubre lo que usan las guías (títulos, párrafos,
 * listas, tablas, citas, bloques de código, negritas, enlaces y código en
 * línea). Así la guía tiene **una sola fuente** —el archivo `.md`— y la página
 * de la app y la del sitio estático se generan de ahí, sin depender de un
 * paquete externo ni de copiar y pegar el texto.
 */

export type MarkdownHeading = {
    id: string;
    text: string;
    level: number;
};

export type RenderedMarkdown = {
    html: string;
    headings: MarkdownHeading[];
};

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function slugify(text: string): string {
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/** Negritas, cursivas, código y enlaces. El texto ya viene escapado. */
function inline(text: string): string {
    return text
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
        .replace(
            /\[([^\]]+)\]\(([^)\s]+)\)/g,
            (match, label: string, href: string) => {
                /**
                 * Solo enlaces internos y protocolos conocidos: el contenido
                 * es nuestro, pero no se abre la puerta a `javascript:`. Si el
                 * enlace no es válido, queda solo el texto, sin marcado.
                 */
                if (!/^(https?:\/\/|mailto:|\/)/i.test(href)) {
                    return label;
                }

                return `<a href="${href}" class="font-semibold text-margarita-700 underline">${label}</a>`;
            }
        );
}

function isTableSeparator(line: string): boolean {
    return /^\|?[\s:-]*-{3,}[\s:|-]*$/.test(line.trim());
}

function splitRow(line: string): string[] {
    return line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
}

export function renderMarkdown(markdown: string): RenderedMarkdown {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const html: string[] = [];
    const headings: MarkdownHeading[] = [];

    let index = 0;

    while (index < lines.length) {
        const line = lines[index];

        if (!line.trim()) {
            index += 1;
            continue;
        }

        /* Bloque de código */
        if (line.trim().startsWith("```")) {
            const language = line.trim().slice(3).trim();
            const code: string[] = [];
            index += 1;

            while (index < lines.length && !lines[index].trim().startsWith("```")) {
                code.push(lines[index]);
                index += 1;
            }

            index += 1;
            html.push(
                `<pre><code${language ? ` class="language-${escapeHtml(language)}"` : ""}>${escapeHtml(
                    code.join("\n")
                )}</code></pre>`
            );
            continue;
        }

        /* Separador */
        if (/^---+$/.test(line.trim())) {
            html.push("<hr />");
            index += 1;
            continue;
        }

        /* Títulos */
        const heading = /^(#{1,3})\s+(.*)$/.exec(line);

        if (heading) {
            const level = heading[1].length;
            const text = escapeHtml(heading[2].trim());
            const id = slugify(heading[2]);

            headings.push({ id, text: heading[2].trim(), level });
            html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
            index += 1;
            continue;
        }

        /* Cita */
        if (line.trim().startsWith(">")) {
            const quote: string[] = [];

            while (index < lines.length && lines[index].trim().startsWith(">")) {
                quote.push(lines[index].trim().replace(/^>\s?/, ""));
                index += 1;
            }

            html.push(`<blockquote>${inline(escapeHtml(quote.join(" ")))}</blockquote>`);
            continue;
        }

        /* Tabla */
        if (
            line.includes("|") &&
            index + 1 < lines.length &&
            isTableSeparator(lines[index + 1])
        ) {
            const header = splitRow(line).map((cell) => inline(escapeHtml(cell)));
            index += 2;
            const rows: string[][] = [];

            while (index < lines.length && lines[index].includes("|")) {
                rows.push(splitRow(lines[index]).map((cell) => inline(escapeHtml(cell))));
                index += 1;
            }

            html.push(
                '<div class="marga-table"><table><thead><tr>' +
                    header.map((cell) => `<th>${cell}</th>`).join("") +
                    "</tr></thead><tbody>" +
                    rows
                        .map(
                            (row) =>
                                "<tr>" +
                                row.map((cell) => `<td>${cell}</td>`).join("") +
                                "</tr>"
                        )
                        .join("") +
                    "</tbody></table></div>"
            );
            continue;
        }

        /* Listas */
        if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
            const ordered = /^\s*\d+\.\s+/.test(line);
            const items: string[] = [];

            while (
                index < lines.length &&
                /^\s*([-*]|\d+\.)\s+/.test(lines[index])
            ) {
                items.push(
                    lines[index].replace(/^\s*([-*]|\d+\.)\s+/, "").trim()
                );
                index += 1;

                /**
                 * Un renglón puede seguir en la línea de abajo con sangría.
                 * Sin esto, la lista se partía en dos y la numeración volvía a
                 * empezar en 1.
                 */
                while (
                    index < lines.length &&
                    lines[index].trim() &&
                    /^\s{2,}\S/.test(lines[index]) &&
                    !/^\s*([-*]|\d+\.)\s+/.test(lines[index])
                ) {
                    items[items.length - 1] += " " + lines[index].trim();
                    index += 1;
                }
            }

            const tag = ordered ? "ol" : "ul";
            html.push(
                `<${tag}>` +
                    items.map((item) => `<li>${inline(escapeHtml(item))}</li>`).join("") +
                    `</${tag}>`
            );
            continue;
        }

        /* Párrafo: junta las líneas hasta el siguiente bloque */
        const paragraph: string[] = [line];
        index += 1;

        while (
            index < lines.length &&
            lines[index].trim() &&
            !/^(#{1,3})\s|^\s*([-*]|\d+\.)\s|^>|^```|^---+$/.test(lines[index]) &&
            !(lines[index].includes("|") && isTableSeparator(lines[index + 1] || ""))
        ) {
            paragraph.push(lines[index]);
            index += 1;
        }

        html.push(
            `<p>${inline(escapeHtml(paragraph.join(" ").replace(/\s+/g, " ").trim()))}</p>`
        );
    }

    return { html: html.join("\n"), headings };
}
