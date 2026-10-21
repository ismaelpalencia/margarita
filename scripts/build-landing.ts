/**
 * Arma la carpeta `landing/`: la página de venta como sitio estático, para
 * subirlo aparte de la aplicación.
 *
 *     npm run landing:build
 *
 * Por qué existe: cada operación (cada cliente) vive en su propio subdominio,
 * del tipo `palencia.margaritaapp.org`, y ahí la raíz manda al inicio de
 * sesión. La oferta, la guía de Meta y el aviso de privacidad viven en el
 * dominio del producto, como sitio aparte: así un cambio de marketing no obliga
 * a desplegar en la instalación de cada cliente.
 *
 * Las plantillas son las mismas que usa la aplicación (`src/views/pages/home`),
 * así que la página publicada y la que sirve la app no pueden decir cosas
 * distintas. Este script sólo las pinta y las guarda.
 */

import fs from "node:fs";
import path from "node:path";

import ejs from "ejs";

import { appConfig } from "../src/config/app.config";
import { loadGuide } from "../src/content/guides";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "landing");
const VIEWS = path.join(ROOT, "src", "views");
const PUBLIC = path.join(ROOT, "src", "public");

/** Las páginas que forman el sitio, con el archivo que produce cada una. */
const PAGES: Array<{ view: string; file: string; title: string }> = [
    {
        view: "pages/home/index",
        file: "index.html",
        title: "Margarita — Cobranza por WhatsApp para equipos"
    },
    {
        view: "pages/home/how-to-start",
        file: "como-empezar.html",
        title: "Cómo empezar - Margarita"
    },
    {
        view: "pages/home/guia",
        file: "guia.html",
        title: "Guía de uso - Margarita"
    },
    {
        view: "pages/home/plantillas",
        file: "plantillas.html",
        title: "Guía de plantillas - Margarita"
    },
    {
        view: "pages/home/propuesta",
        file: "propuesta.html",
        title: "Propuesta comercial - Margarita"
    },
    {
        view: "pages/home/access",
        file: "acceso.html",
        title: "Ya tengo acceso - Margarita"
    },
    {
        view: "pages/home/privacy",
        file: "aviso-de-privacidad.html",
        title: "Aviso de privacidad - Margarita"
    }
];

/** Los mismos datos que `HomeController` le pasa a las vistas. */
function locals(title: string) {
    return {
        title,
        appName: appConfig.name,
        supportWhatsappNumber: appConfig.supportWhatsapp,
        supportWhatsappUrl: appConfig.supportWhatsapp
            ? `https://wa.me/${appConfig.supportWhatsapp}`
            : "",
        supportEmail: appConfig.supportEmail,
        supportWhatsappDisplay: appConfig.supportWhatsappDisplay,
        setupServicePrice: appConfig.setupServicePrice,
        installPrice: appConfig.installPrice,
        installPriceWithMeta: appConfig.installPriceWithMeta,
        installPricePromo: appConfig.installPricePromo,
        installPromoLabel: appConfig.installPromoLabel,
        installPromoUntil: appConfig.installPromoUntil,
        installPromoSpotsLeft: appConfig.installPromoSpotsLeft,
        monthlyCommit3: appConfig.monthlyCommit3,
        monthlyCommit6: appConfig.monthlyCommit6,
        monthlyCommit12: appConfig.monthlyCommit12,
        installSavingWithMeta: appConfig.installSavingWithMeta,
        installSavingBasic: appConfig.installSavingBasic,
        pilotDays: appConfig.pilotDays,
        installMonthlyPrice: appConfig.installMonthlyPrice,
        installMonthlyListPrice: appConfig.installMonthlyListPrice
    };
}

/**
 * Enlaza las páginas entre sí por nombre de archivo.
 *
 * El acceso se manda a la página que explica de dónde se entra: el formulario
 * de inicio de sesión **no** se copia al sitio estático, porque vive siempre en
 * el dominio de cada operación (y así no hace falta abrir CORS ni una excepción
 * de origen).
 */
function rewriteLinks(html: string) {
    /**
     * La versión del despliegue va al final del CSS y los favicons: así, al
     * volver a subir el sitio, el navegador de quien ya lo visitó trae los
     * archivos nuevos en lugar de los guardados.
     */
    const assetTag = `?v=${appConfig.commit || appConfig.version}`;

    return html
        .replace(/href="\/como-empezar"/g, 'href="como-empezar.html"')
        .replace(/href="\/guia"/g, 'href="guia.html"')
        .replace(/href="\/plantillas"/g, 'href="plantillas.html"')
        .replace(/href="\/propuesta"/g, 'href="propuesta.html"')
        .replace(/href="\/aviso-de-privacidad"/g, 'href="aviso-de-privacidad.html"')
        .replace(/href="\/acceso"/g, 'href="acceso.html"')
        .replace(/href="\/auth\/login"/g, 'href="acceso.html"')
        .replace(/href="\/setup"/g, 'href="acceso.html"')
        .replace(/href="\/"/g, 'href="index.html"')
        /**
         * Los archivos van con ruta relativa: así el sitio funciona igual si se
         * sube a un dominio propio o dentro de una carpeta (`/landing/`).
         */
        .replace(/href="\/css\//g, `href="css/`)
        .replace(/href="\/docs\//g, 'href="docs/')
        .replace(/href="(css\/style\.css)"/g, `href="$1${assetTag}"`)
        .replace(
            /href="(css\/landing-2026\.css)"/g,
            `href="$1${assetTag}"`
        )
        .replace(
            /href="\/(favicon|apple-touch|android-chrome|site\.webmanifest)([^"]*)"/g,
            `href="$1$2${assetTag}"`
        )
        /**
         * El aviso de carga también vive en el sitio estático: la capa del
         * sello aparece al cambiar de página, igual que dentro del panel.
         */
        .replace(/src="\/js\//g, 'src="js/')
        .replace(/src="(js\/loading\.js)"/g, `src="$1${assetTag}"`)
        /**
         * El sello del aviso de carga se toma de este `meta`: en el sitio
         * estático la ruta tiene que ser relativa, igual que el resto.
         */
        .replace(/content="\/brand\//g, 'content="brand/')
        .replace(/src="\/brand\//g, 'src="brand/')
        .replace(/src="\/(favicon|apple-touch|android-chrome)/g, 'src="$1');
}

function copy(from: string, to: string) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
}

function build() {
    /**
     * Se limpia todo menos el README: es de la carpeta, no algo que se genere
     * (y no se debe perder al regenerar).
     */
    fs.mkdirSync(OUT, { recursive: true });

    for (const entry of fs.readdirSync(OUT)) {
        if (entry !== "README.md") {
            fs.rmSync(path.join(OUT, entry), { recursive: true, force: true });
        }
    }

    fs.mkdirSync(OUT, { recursive: true });

    for (const page of PAGES) {
        const file = path.join(VIEWS, `${page.view}.ejs`);

        /**
         * Las guías salen del mismo `.md` que usa la aplicación: la página es
         * solo la portada y el estilo. Así no se pueden separar.
         */
        const extra: Record<string, unknown> = {};

        if (page.file === "guia.html") {
            const guide = loadGuide("uso");
            extra.guideHtml = guide.html;
            extra.guideHeadings = guide.headings.filter(
                (heading) => heading.level === 2
            );
        }

        if (page.file === "plantillas.html") {
            const guide = loadGuide("plantillas");
            extra.guideHtml = guide.html;
            extra.guideHeadings = guide.headings.filter(
                (heading) => heading.level === 2
            );
        }

        const html = ejs.render(fs.readFileSync(file, "utf8"), {
            filename: file,
            ...locals(page.title),
            ...extra
        });

        fs.writeFileSync(path.join(OUT, page.file), rewriteLinks(html));
        console.log("  ", page.file);
    }

    /** El CSS compilado y los archivos de marca. */
    copy(path.join(PUBLIC, "css", "style.css"), path.join(OUT, "css", "style.css"));
    copy(
        path.join(PUBLIC, "css", "landing-2026.css"),
        path.join(OUT, "css", "landing-2026.css")
    );

    /**
     * El aviso de carga. Es el mismo archivo que usa el panel: aquí queda con
     * rutas relativas para que el sitio funcione en cualquier carpeta.
     */
    copy(
        path.join(PUBLIC, "js", "loading.js"),
        path.join(OUT, "js", "loading.js")
    );

    /** La propuesta en PDF, para el botón «Descargar» de la página. */
    const propuestaPdf = path.join(PUBLIC, "docs", "propuesta-margarita.pdf");

    if (fs.existsSync(propuestaPdf)) {
        copy(propuestaPdf, path.join(OUT, "docs", "propuesta-margarita.pdf"));
    }

    for (const file of fs.readdirSync(path.join(PUBLIC, "brand", "img"))) {
        copy(
            path.join(PUBLIC, "brand", "img", file),
            path.join(OUT, "brand", "img", file)
        );
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

    /** Para que un servidor estático no tenga que adivinar nada. */
    fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nAllow: /\n");

    /**
     * El manifiesto trae rutas absolutas pensadas para la aplicación; en el
     * sitio estático van relativas, si no, el ícono del celular apunta al
     * dominio equivocado.
     */
    const manifestPath = path.join(OUT, "site.webmanifest");

    if (fs.existsSync(manifestPath)) {
        const manifest = fs
            .readFileSync(manifestPath, "utf8")
            .replace(/"src": "\//g, '"src": "')
            .replace(/"start_url": "\/"/, '"start_url": "index.html"');

        fs.writeFileSync(manifestPath, manifest);
    }

    console.log(`\nLanding listo en ${OUT}`);
    console.log("Súbelo como sitio estático y apunta ahí el dominio del producto.");
}

build();
