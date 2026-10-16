import assert from "node:assert/strict";
import test from "node:test";

import { servesLanding } from "./app.config";

/**
 * ¿Quién sirve la página de venta?
 *
 * Sin `PRODUCT_DOMAIN` configurado, la aplicación se comporta como siempre y
 * sirve la landing en su propia raíz: es el caso de una instalación sola y el de
 * las pruebas. Con la variable puesta, sólo esos dominios la sirven: los
 * subdominios de cada operación (`palencia.margaritaapp.org`) mandan al inicio
 * de sesión, para que el equipo del cliente no caiga en la página de venta.
 */
test("sin dominios configurados, la raíz sirve la landing (comportamiento de siempre)", () => {
    assert.equal(servesLanding("127.0.0.1:3987", []), true);
    assert.equal(servesLanding("palencia.margaritaapp.org", []), true);
});

test("el host se compara sin puerto y sin mayúsculas", () => {
    const dominios = ["margaritaapp.org"];

    assert.equal(servesLanding("margaritaapp.org:3000", dominios), true);
    assert.equal(servesLanding("MARGARITAAPP.ORG", dominios), true);
    assert.equal(servesLanding(" margaritaapp.org ", dominios), true);
});

test("un subdominio de operación no sirve la oferta", () => {
    const dominios = ["margaritaapp.org", "www.margaritaapp.org"];

    assert.equal(servesLanding("palencia.margaritaapp.org", dominios), false);
    assert.equal(servesLanding("cliente.margaritaapp.org", dominios), false);
    assert.equal(servesLanding("localhost", dominios), false);
    assert.equal(servesLanding("www.margaritaapp.org", dominios), true);
});
