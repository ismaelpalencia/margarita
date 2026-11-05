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
        title: "Margarita — Automatiza WhatsApp con IA",
        description:
            "Atiende, califica y deriva conversaciones de WhatsApp con IA acotada, control humano y panel completo. API oficial de Meta, datos cifrados y $1,299 MXN al mes con 2,000 respuestas de IA.",
        active: "home"
    },
    {
        template: "ia.ejs",
        file: "ia.html",
        title: "IA para WhatsApp con control humano — Margarita",
        description:
            "La IA responde solo lo que está en tu base de conocimiento, entrega a una persona cuando duda y deja todo registrado. Panel de IA por conversación, confianza y costo.",
        active: "ia"
    },
    {
        template: "precios.ejs",
        file: "precios.html",
        title: "Precios — Margarita",
        description:
            "Margarita IA: $1,299 MXN al mes, 2,000 respuestas de IA incluidas, sin instalación y con onboarding incluido. Precios más IVA.",
        active: "precios"
    },
    {
        template: "demo.ejs",
        file: "demo.html",
        title: "Demo de WhatsApp con IA — Margarita",
        description:
            "Prueba la IA con una base de conocimiento real. Simulador de WhatsApp con panel de modo, intención, confianza, handoff y costo.",
        active: "demo"
    },
    {
        template: "onboarding.ejs",
        file: "onboarding.html",
        title: "Alta en 7 días — Margarita",
        description:
            "Qué necesitas traer, qué configuramos y en qué orden. Tu operación de WhatsApp lista en 7 días.",
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
        title: "Guía de plantillas — Margarita",
        description:
            "Cómo crear plantillas de WhatsApp que Meta apruebe y que cuesten poco. Categorías, reglas, variables y motivos de rechazo.",
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

/**
 * Precios vigentes del producto. La fuente que gobierna es
 * docs/alcance-produccion.md; si cambian, se actualiza primero ahí y luego
 * esta constante.
 */
const PRICING = {
    plan: {
        name: "Margarita IA",
        monthly: 1299,
        replies: 2000,
        description: "Todo incluido: plataforma, IA y onboarding.",
        features: [
            "Plataforma completa: bandeja, agentes, campañas y plantillas",
            "IA en sugerencias y respuesta automática acotada",
            "2,000 respuestas de IA incluidas al mes",
            "Base de conocimiento, handoff y pausa por hilo",
            "Horarios y mensaje fuera de horario",
            "Botones y listas interactivas",
            "Flujos por vertical y paquete inicial",
            "Leads, exportación CSV y webhook firmado",
            "Demo pública y reportes de servicio",
            "Onboarding: sesión de arranque de 2 h + guía",
            "Cifrado, respaldos, 2FA y bitácora"
        ]
    },
    /** Solo referencia del operador; no se renderiza en el landing. */
    overagePrice: 150,
    overageUnit: 1000,
    cancellation: "Cancela cuando quieras, sin compromiso"
};

const money = (value: number) =>
    new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(value);

const demoApiBase = (process.env.DEMO_API_BASE || "https://demo.margaritaapp.org")
    .trim()
    .replace(/\/+$/, "");
const demoUrl = process.env.DEMO_URL?.trim() || demoApiBase + "/demo";

/** Pixel de Meta para los anuncios; vacío = no se renderiza. */
const metaPixelId = (
    process.env.META_PIXEL_ID || "2253115132222921"
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
        if (entry.endsWith(".html") && !PAGES.some((page) => page.file === entry)) {
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

    fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nAllow: /\n");
}

function build() {
    fs.mkdirSync(OUT, { recursive: true });
    cleanGenerated();
    copyAssets();

    const guides = {
        uso: loadGuide("uso"),
        plantillas: loadGuide("plantillas")
    };

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

        const html = ejs.render(fs.readFileSync(templatePath, "utf8"), {
            filename: templatePath,
            title: page.title,
            description: page.description,
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
            pricing: PRICING,
            money,
            demoApiBase,
            demoUrl,
            metaPixelId,
            year: new Date().getFullYear(),
            ...extra
        });

        fs.writeFileSync(path.join(OUT, page.file), html);
        console.log("  ", page.file);
    }

    console.log("\nLanding listo en " + OUT);
    console.log("Súbelo a Cloudflare Pages o al hosting estático del producto.");
}

build();
