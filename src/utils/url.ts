export type NormalizedUrl = {
    url: string;
    normalized: boolean;
};

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
