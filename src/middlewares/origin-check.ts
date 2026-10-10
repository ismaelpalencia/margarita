import { hostFromUrl } from "../utils/url";

export type OriginCheckResult = {
    allowed: boolean;
    /** El esquema (http/https) no coincide, aunque el dominio sí. */
    schemeMismatch: boolean;
    reason: string | null;
};

/**
 * Decide si el origen de una petición puede operar contra la aplicación.
 *
 * Se compara el dominio (host + puerto) y no el esquema completo: en
 * Railway el borde termina el TLS, así que un navegador puede llegar por
 * `http://` aunque la app publique `https://`. Bloquear por eso dejaba al
 * operador fuera de su propio panel sin ninguna ganancia real de
 * seguridad, porque un ataque CSRF siempre viene de otro dominio.
 */
export function checkRequestOrigin(
    requestOrigin: string | null | undefined,
    expectedUrl: string
): OriginCheckResult {
    const expectedHost = hostFromUrl(expectedUrl);
    const receivedHost = hostFromUrl(requestOrigin);

    if (!expectedHost) {
        return {
            allowed: true,
            schemeMismatch: false,
            reason: null
        };
    }

    if (!receivedHost) {
        return {
            allowed: false,
            schemeMismatch: false,
            reason: "El origen de la petición no es una URL válida."
        };
    }

    if (receivedHost !== expectedHost) {
        return {
            allowed: false,
            schemeMismatch: false,
            reason: `El origen "${receivedHost}" no coincide con el dominio configurado en APP_URL ("${expectedHost}").`
        };
    }

    const expectedScheme = expectedUrl.slice(0, expectedUrl.indexOf(":"));
    const receivedScheme = String(requestOrigin).slice(
        0,
        String(requestOrigin).indexOf(":")
    );

    return {
        allowed: true,
        schemeMismatch: Boolean(
            expectedScheme && receivedScheme && expectedScheme !== receivedScheme
        ),
        reason: null
    };
}
