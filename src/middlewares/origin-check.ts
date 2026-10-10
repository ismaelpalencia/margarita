import { hostFromUrl } from "../utils/url";

export type OriginCheckResult = {
    allowed: boolean;
    /** El esquema (http/https) no coincide, aunque el dominio sí. */
    schemeMismatch: boolean;
    /**
     * El navegador no envió un origen identificable (cabecera ausente o
     * literal "null").
     */
    opaqueOrigin: boolean;
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
    const received = String(requestOrigin ?? "").trim();
    const receivedHost = hostFromUrl(received);

    if (!expectedHost) {
        return {
            allowed: true,
            schemeMismatch: false,
            opaqueOrigin: false,
            reason: null
        };
    }

    /**
     * Un navegador puede enviar `Origin: null` cuando el origen es opaco:
     * página en un iframe con sandbox, archivo local, o una redirección
     * entre dominios. Esa cabecera no identifica a nadie, así que no
     * aporta nada a la decisión y bloquearla dejaba fuera a navegadores
     * legítimos. Un atacante real envía su propio dominio, que sí se
     * puede leer, y ese sigue bloqueado.
     */
    if (!received || received.toLowerCase() === "null" || !receivedHost) {
        return {
            allowed: true,
            schemeMismatch: false,
            opaqueOrigin: true,
            reason: null
        };
    }

    if (receivedHost !== expectedHost) {
        return {
            allowed: false,
            schemeMismatch: false,
            opaqueOrigin: false,
            reason: `El origen "${receivedHost}" no coincide con el dominio configurado en APP_URL ("${expectedHost}").`
        };
    }

    const expectedScheme = expectedUrl.slice(0, expectedUrl.indexOf(":"));
    const receivedScheme = received.slice(0, received.indexOf(":"));

    return {
        allowed: true,
        schemeMismatch: Boolean(
            expectedScheme && receivedScheme && expectedScheme !== receivedScheme
        ),
        opaqueOrigin: false,
        reason: null
    };
}
