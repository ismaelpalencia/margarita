/**
 * Aviso de "cargando" con el sello de Margarita.
 *
 * Dos momentos distintos, con la misma pieza:
 *
 * 1. **Cambio de pantalla** (un enlace o un formulario): aparece una capa con
 *    el sello y un aro girando. Se retrasa 160 ms a propósito: si la respuesta
 *    es instantánea, no se alcanza a ver y la navegación se siente más rápida.
 * 2. **Botón ocupado**: el botón que se envió se queda con un aro diminuto y
 *    sin poder tocarse otra vez, para que nadie mande el mensaje dos veces.
 *
 * Reglas que evitan los bugs clásicos de esto:
 * - La capa se esconde al cargar y también al volver con el botón "atrás"
 *   (`pageshow`), que es cuando el navegador restaura la página desde su
 *   memoria y una capa mal escondida deja todo tapado.
 * - Si la navegación no ocurre (el servidor no responde), la capa se retira
 *   sola: es preferible ver la pantalla vieja que una capa infinita.
 * - El botón que envía se desactiva **después** de copiar su nombre y su valor
 *   a un campo oculto; si no, el navegador no manda ese dato y los formularios
 *   con varios botones ("Prometió pagar", "Pagado"…) llegarían vacíos.
 */
(function () {
    "use strict";

    var SHOW_DELAY = 160;
    var GIVE_UP = 12000;

    var overlay = null;
    var showTimer = null;
    var giveUpTimer = null;
    var visible = false;
    var pageReady = false;

    function buildOverlay() {
        if (overlay) {
            return overlay;
        }

        /**
         * La ruta del sello viene del `meta`: en la app es absoluta y en el
         * sitio estático es relativa, y el script es el mismo para los dos.
         */
        var sealTag = document.querySelector('meta[name="marga-seal"]');
        var seal = (sealTag && sealTag.getAttribute("content")) ||
            "/brand/img/margarita-icon-128.png";

        overlay = document.createElement("div");
        overlay.className = "marga-overlay";
        overlay.setAttribute("aria-hidden", "true");
        overlay.setAttribute("role", "status");
        overlay.innerHTML =
            '<div class="marga-loader">' +
            '<span class="marga-loader__ring" aria-hidden="true"></span>' +
            '<img src="' + seal + '" alt="" class="marga-loader__seal" />' +
            "</div>" +
            '<p class="marga-overlay__text">Cargando…</p>';

        document.body.appendChild(overlay);

        return overlay;
    }

    function show() {
        if (visible || !document.body) {
            return;
        }

        buildOverlay();
        visible = true;
        overlay.setAttribute("data-visible", "true");
        overlay.setAttribute("aria-hidden", "false");

        /* Si la navegación nunca llega, no se queda tapando la pantalla. */
        clearTimeout(giveUpTimer);
        giveUpTimer = setTimeout(hide, GIVE_UP);
    }

    function hide() {
        clearTimeout(showTimer);
        clearTimeout(giveUpTimer);
        showTimer = null;
        giveUpTimer = null;

        /**
         * La capa de arranque la maneja su propio script en el `<head>`; aquí
         * solo se retira si quedó viva al volver con el botón "atrás".
         */
        var boot = document.getElementById("marga-boot");

        if (boot && boot.parentNode) {
            boot.parentNode.removeChild(boot);
        }

        if (!visible || !overlay) {
            return;
        }

        visible = false;
        overlay.setAttribute("data-visible", "false");
        overlay.setAttribute("aria-hidden", "true");
    }

    /** Programa la capa con retraso, para no parpadear en respuestas rápidas. */
    function scheduleShow() {
        if (visible || showTimer || !pageReady) {
            return;
        }

        showTimer = setTimeout(function () {
            showTimer = null;
            show();
        }, SHOW_DELAY);
    }

    /**
     * Deja el botón que envió el formulario en estado "ocupado".
     *
     * El nombre y el valor del botón viajan como campo oculto porque el botón
     * desactivado ya no se envía; sin esto, "No contestó" o "Pagado" llegarían
     * al servidor sin decir cuál se tocó.
     */
    function markSubmitter(form, submitter) {
        if (!submitter || submitter.getAttribute("data-marga-loading") === "true") {
            return;
        }

        if (submitter.name) {
            var hidden = document.createElement("input");
            hidden.type = "hidden";
            hidden.name = submitter.name;
            hidden.value = submitter.value;
            hidden.setAttribute("data-marga-copy", "true");
            form.appendChild(hidden);
        }

        submitter.setAttribute("data-marga-loading", "true");
        submitter.setAttribute("aria-busy", "true");
        submitter.disabled = true;
    }

    document.addEventListener("DOMContentLoaded", function () {
        pageReady = true;
    });

    window.addEventListener("load", function () {
        pageReady = true;
        hide();
    });

    /* Volver con el botón "atrás" restaura la página: nada de capas colgadas. */
    window.addEventListener("pageshow", function () {
        pageReady = true;
        hide();
        document
            .querySelectorAll('[data-marga-loading="true"]')
            .forEach(function (element) {
                element.removeAttribute("data-marga-loading");
                element.removeAttribute("aria-busy");
                element.disabled = false;
            });
    });

    document.addEventListener("submit", function (event) {
        var form = event.target;

        if (!(form instanceof HTMLFormElement) || event.defaultPrevented) {
            return;
        }

        /* Un formulario que abre otra pestaña no tapa esta pantalla. */
        if (form.target && form.target !== "_self") {
            return;
        }

        /* Segundo envío del mismo formulario: se corta. */
        if (form.getAttribute("data-marga-submitting") === "true") {
            event.preventDefault();
            return;
        }

        form.setAttribute("data-marga-submitting", "true");

        var submitter =
            event.submitter ||
            form.querySelector('button[type="submit"], input[type="submit"]');

        markSubmitter(form, submitter);
        scheduleShow();
    });

    document.addEventListener("click", function (event) {
        if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        ) {
            return;
        }

        var link = event.target.closest("a[href]");

        if (!link) {
            return;
        }

        if (link.target && link.target !== "_self") {
            return;
        }

        if (link.hasAttribute("download")) {
            return;
        }

        /* Los anclajes ("#precios") no cambian de página. */
        var href = link.getAttribute("href") || "";

        if (!href || href.charAt(0) === "#") {
            return;
        }

        if (link.origin !== window.location.origin) {
            return;
        }

        /**
         * Descargas: el navegador se queda en la misma página, así que la capa
         * taparía el panel sin que haya nada que esperar. Aplica a los archivos
         * de una conversación y a las exportaciones en CSV o JSON.
         */
        if (
            /\/(media|export)\b/i.test(href) ||
            /\.(csv|json|xlsx?|pdf|zip)(\?|$)/i.test(href) ||
            /[?&]download=/i.test(href)
        ) {
            return;
        }

        scheduleShow();
    });
})();
