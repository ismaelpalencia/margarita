/**
 * Copiar valores al portapapeles, con aviso en el propio botón.
 *
 * Dos casos, los dos con delegación porque el HTML se vuelve a pintar (las
 * burbujas del hilo, por ejemplo) y un `addEventListener` por botón se perdería
 * en cada actualización:
 *
 *   data-copy-reply-id="ID_DE_BOTON"     el identificador de un botón de WhatsApp
 *   data-copy-target="ID_DE_ELEMENTO"    el contenido de otro elemento de la página
 */
(function () {
    "use strict";

    function copy(button, value) {
        var original = button.textContent;

        var done = function () {
            button.textContent = "copiado ✓";

            setTimeout(function () {
                button.textContent = original;
            }, 1500);
        };

        var fallback = function () {
            /**
             * Sin permisos de portapapeles —o sin HTTPS— el texto se selecciona
             * para que se pueda copiar a mano en vez de fallar en silencio.
             */
            var target = button.getAttribute("data-copy-target");
            var node = target ? document.getElementById(target) : null;
            var range = document.createRange();

            range.selectNodeContents(node || button);

            var selection = window.getSelection();

            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(done).catch(fallback);
        } else {
            fallback();
        }
    }

    document.addEventListener("click", function (event) {
        var replyButton = event.target.closest("[data-copy-reply-id]");

        if (replyButton) {
            copy(replyButton, replyButton.getAttribute("data-copy-reply-id") || "");

            return;
        }

        var dumpButton = event.target.closest("[data-copy-target]");

        if (!dumpButton) {
            return;
        }

        var source = document.getElementById(
            dumpButton.getAttribute("data-copy-target") || ""
        );

        if (source) {
            copy(dumpButton, source.textContent || "");
        }
    });
})();
