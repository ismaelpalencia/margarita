export type NormalizedUrl = {
    url: string;
    normalized: boolean;
};

export type AppUrlSource = "APP_URL" | "RAILWAY_PUBLIC_DOMAIN" | "DEFAULT";

function isLocalHost(value: string): boolean {
    return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(value);
}

/**
 * Normaliza el valor de APP_URL.
 *
 * Railway y otros proveedores muestran el dominio sin esquema
 * (`mi-app.up.railway.app`), y si se pega tal cual, `new URL()` falla:
 * la validación CSRF queda desactivada y la URL del webhook que se
 * muestra en el panel sale incompleta. Aquí se corrige solo.
 */
export function normalizeAppUrl(raw: string | null | undefined): NormalizedUrl {
    const value = (raw ?? "").trim().replace(/\/+$/, "");

    if (!value) {
        return {
            url: "http://localhost:3000",
            normalized: true
        };
    }

    if (/^https?:\/\//i.test(value)) {
        return {
            url: value,
            normalized: false
        };
    }

    const scheme = isLocalHost(value) ? "http" : "https";
    const candidate = `${scheme}://${value}`;

    try {
        new URL(candidate);
    } catch {
        /* Si no se puede reparar, se devuelve tal cual para que el
           problema se vea en el aviso en lugar de esconderse. */
        return {
            url: value,
            normalized: false
        };
    }

    return {
        url: candidate,
        normalized: true
    };
}

/**
 * De dónde sale la URL pública de la instalación.
 *
 * En Railway, `RAILWAY_PUBLIC_DOMAIN` es el dominio que el propio proveedor
 * asigna. Usarlo cuando falta `APP_URL` evita el tropiezo clásico del alta:
 * sin URL, la validación de origen (CSRF) queda desactivada y el panel
 * muestra un webhook incompleto, sin que nada lo advierta.
 */
export function resolveAppUrl(env: {
    APP_URL?: string | null;
    RAILWAY_PUBLIC_DOMAIN?: string | null;
}): { url: NormalizedUrl; source: AppUrlSource } {
    const explicit = env.APP_URL?.trim();

    if (explicit) {
        return { url: normalizeAppUrl(explicit), source: "APP_URL" };
    }

    const railway = env.RAILWAY_PUBLIC_DOMAIN?.trim();

    if (railway) {
        /**
         * Se le pasa tal cual: `normalizeAppUrl` agrega `https://` cuando
         * viene sin esquema (lo normal en Railway) y no lo duplica si algún
         * día lo entrega con él.
         */
        return {
            url: normalizeAppUrl(railway),
            source: "RAILWAY_PUBLIC_DOMAIN"
        };
    }

    return { url: normalizeAppUrl(""), source: "DEFAULT" };
}

/** Dominio (host + puerto) de una URL, o null si no se puede leer. */
export function hostFromUrl(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }

    try {
        return new URL(value).host.toLowerCase();
    } catch {
        return null;
    }
}
