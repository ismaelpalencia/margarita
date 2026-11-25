/**
 * Arma la carpeta `landing/`: el sitio de venta estático del producto.
 *
 *     npm run landing:build
 *
 * Las plantillas viven en `landing/*.ejs` y se renderizan a `landing/*.html`
 * en la misma carpeta. Así el sitio se puede editar sin tocar la aplicación y
 * se publica tal cual en Cloudflare Pages (o cualquier hosting estático).
 *
 * El comando y la carpeta de salida no cambian. Lo que se conserva:
 * plantillas `.ejs`, `assets/`, `README.md`, favicons, `robots.txt` y
 * `site.webmanifest`. Lo demás generado se reescribe.
 */

import fs from "node:fs";
import path from "node:path";

import ejs from "ejs";

import { appConfig } from "../src/config/app.config";
import { loadGuide } from "../src/content/guides";
import { money, PRODUCT_PRICING } from "../src/content/pricing";
import { renderMarkdown } from "../src/utils/markdown";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "landing");
const PUBLIC = path.join(ROOT, "src", "public");
const BRAND = path.join(PUBLIC, "brand", "img");

type Page = {
    template: string;
    file: string;
    title: string;
    description: string;
    active: string;
};

const PAGES: Page[] = [
    {
        template: "index.ejs",
        file: "index.html",
        title: "Margarita — Bandeja compartida para WhatsApp Business",
        description:
            "Organiza y atiende conversaciones de WhatsApp Business con tu equipo. Asignación, respuestas rápidas, plantillas, campañas y automatización opcional.",
        active: "home"
    },
    {
        template: "ia.ejs",
        file: "ia.html",
        title: "Automatización e IA para WhatsApp — Margarita",
        description:
            "Conoce las opciones de automatización de Margarita: flujos guiados e IA configurable para apoyar la atención, con el equipo a cargo de las conversaciones.",
        active: "ia"
    },
    {
        template: "precios.ejs",
        file: "precios.html",
        title: "Planes para atender WhatsApp en equipo — Margarita",
        description:
            "Planes desde $499 MXN al mes para operar WhatsApp Business en equipo. Conoce capacidades, onboarding y consumos externos.",
        active: "precios"
    },
    {
        template: "demo.ejs",
        file: "demo.html",
        title: "Prueba la demo de Margarita — WhatsApp con IA",
        description:
            "Prueba la IA con una base de conocimiento real. Simulador de WhatsApp con panel de modo, intención, confianza, handoff y costo.",
        active: "demo"
    },
    {
        template: "onboarding.ejs",
        file: "onboarding.html",
        title: "Puesta en marcha de WhatsApp — Margarita",
        description:
            "Requisitos y pasos para conectar WhatsApp Business, preparar el equipo y empezar a operar Margarita.",
        active: "onboarding"
    },
    {
        template: "configuracion-por-negocio.ejs",
        file: "configuracion-por-negocio.html",
        title: "Checklist de configuración por negocio — Margarita",
        description:
            "Checklist para configurar Meta, llamadas, IA, operación, infraestructura y privacidad de cada negocio en Margarita.",
        active: "onboarding"
    },
    {
        template: "guia.ejs",
        file: "guia.html",
        title: "Guía de uso — Margarita",
        description:
            "El manual del equipo que atiende por WhatsApp: bandeja, plantillas, campañas, IA, horarios, leads y respaldos.",
        active: "guia"
    },
    {
        template: "plantillas.ejs",
        file: "plantillas.html",
        title: "Guía para trabajar con plantillas de WhatsApp — Margarita",
        description:
            "Conoce categorías, variables y reglas generales de las plantillas de WhatsApp. Meta controla su revisión, aprobación y cargos.",
        active: "plantillas"
    },
    {
        template: "privacidad.ejs",
        file: "privacidad.html",
        title: "Aviso de privacidad — Margarita",
        description:
            "Cómo tratamos los datos personales en Margarita: cifrado, conservación, derechos y contacto.",
        active: "privacidad"
    },
    {
        template: "acceso.ejs",
        file: "acceso.html",
        title: "Ya tengo acceso — Margarita",
        description:
            "Cómo entrar al panel de tu cuenta de Margarita y qué hacer si olvidaste tu dominio o contraseña.",
        active: "acceso"
    }
];

const demoApiBase = (process.env.DEMO_API_BASE || "https://demo.margaritaapp.org")
    .trim()
    .replace(/\/+$/, "");
const demoUrl = process.env.DEMO_URL?.trim() || demoApiBase + "/demo";

/** Pixel de Meta para los anuncios; vacío = no se renderiza. */
const metaPixelId = (
    process.env.META_PIXEL_ID || "1602536605246770"
).trim();
const whatsappText =
    process.env.SUPPORT_WHATSAPP_TEXT?.trim() ||
    "Hola, quiero una demo de Margarita IA";

function copy(from: string, to: string) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
}

function cleanGenerated() {
    for (const entry of fs.readdirSync(OUT)) {
        const keep =
            entry === "propuesta.html" ||
            PAGES.some((page) => page.file === entry);

        if (entry.endsWith(".html") && !keep) {
            fs.rmSync(path.join(OUT, entry), { force: true });
        }
    }

    /** Carpetas del generador anterior que ya no se usan. */
    for (const dir of ["css", "js", "docs", "brand"]) {
        fs.rmSync(path.join(OUT, dir), { recursive: true, force: true });
    }
}

function copyAssets() {
    const imagesDir = path.join(OUT, "assets", "img");
    fs.mkdirSync(imagesDir, { recursive: true });

    if (fs.existsSync(BRAND)) {
        for (const file of fs.readdirSync(BRAND)) {
            copy(path.join(BRAND, file), path.join(imagesDir, file));
        }
    }

    for (const file of [
        "favicon.ico",
        "favicon-16x16.png",
        "favicon-32x32.png",
        "apple-touch-icon.png",
        "android-chrome-192x192.png",
        "android-chrome-512x512.png",
        "site.webmanifest"
    ]) {
        const from = path.join(PUBLIC, file);

        if (fs.existsSync(from)) {
            copy(from, path.join(OUT, file));
        }
    }

    fs.writeFileSync(
        path.join(OUT, "robots.txt"),
        "User-agent: *\nAllow: /\n\nSitemap: https://margaritaapp.org/sitemap.xml\n"
    );
}

function build() {
    fs.mkdirSync(OUT, { recursive: true });
    cleanGenerated();
    copyAssets();

    const guides = {
        uso: loadGuide("uso"),
        plantillas: loadGuide("plantillas")
    };
    const businessSetupSource = fs.readFileSync(
        path.join(ROOT, "docs", "configuracion-por-negocio.md"),
        "utf8"
    );
    const businessSetupStart = businessSetupSource.search(/^## /m);
    const businessSetup = renderMarkdown(
        businessSetupStart === -1
            ? businessSetupSource
            : businessSetupSource.slice(businessSetupStart)
    );

    for (const page of PAGES) {
        const templatePath = path.join(OUT, page.template);

        if (!fs.existsSync(templatePath)) {
            throw new Error("Falta la plantilla " + page.template);
        }

        const extra: Record<string, unknown> = {};

        if (page.file === "guia.html") {
            extra.guideHtml = guides.uso.html;
            extra.guideHeadings = guides.uso.headings.filter(
                (heading) => heading.level === 2
            );
        }

        if (page.file === "plantillas.html") {
            extra.guideHtml = guides.plantillas.html;
            extra.guideHeadings = guides.plantillas.headings.filter(
                (heading) => heading.level === 2
            );
        }

        if (page.file === "configuracion-por-negocio.html") {
            extra.setupGuideHtml = businessSetup.html;
            extra.setupGuideHeadings = businessSetup.headings;
        }

        const siteUrl = (
            process.env.SITE_URL || "https://margaritaapp.org"
        ).replace(/\/$/, "");
        const canonicalUrl =
            page.file === "index.html"
                ? siteUrl + "/"
                : siteUrl + "/" + page.file.replace(/\.html$/, "");

        const html = ejs.render(fs.readFileSync(templatePath, "utf8"), {
            filename: templatePath,
            title: page.title,
            description: page.description,
            canonicalUrl,
            active: page.active,
            appName: appConfig.name,
            supportEmail: appConfig.supportEmail,
            supportWhatsappUrl: appConfig.supportWhatsapp
                ? "https://wa.me/" +
                  appConfig.supportWhatsapp +
                  "?text=" +
                  encodeURIComponent(whatsappText)
                : "https://margaritaapp.org",
            supportWhatsappDisplay: appConfig.supportWhatsappDisplay,
            pricing: PRODUCT_PRICING,
            money,
            demoApiBase,
            demoUrl,
            metaPixelId,
            year: new Date().getFullYear(),
            ...extra
        });

        fs.writeFileSync(
            path.join(OUT, page.file),
            html.replace(/[ \t]+$/gm, "").replace(/\n+$/, "\n")
        );
        console.log("  ", page.file);
    }

    const today = new Date().toISOString().slice(0, 10);
    const sitemap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...PAGES.map((page) => {
            const loc =
                "https://margaritaapp.org/" +
                (page.file === "index.html"
                    ? ""
                    : page.file.replace(/\.html$/, ""));
            const priority = page.file === "index.html" ? "1.0" : "0.8";
            return `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>${priority}</priority></url>`;
        }),
        "</urlset>",
        ""
    ].join("\n");

    fs.writeFileSync(path.join(OUT, "sitemap.xml"), sitemap);
    console.log("   sitemap.xml");

    console.log("\nLanding listo en " + OUT);
    console.log("Súbelo a Cloudflare Pages o al hosting estático del producto.");
}

build();
