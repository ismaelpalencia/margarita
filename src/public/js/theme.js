/**
 * Interruptor de tema claro/oscuro.
 *
 * La preferencia se guarda en `localStorage` y se aplica antes del primer
 * pintado desde `brand-head`, así que al recargar no hay un destello blanco.
 * Si el usuario nunca eligió, se respeta la preferencia del sistema.
 *
 * Este archivo solo cambia la clase `dark` en `<html>`: los colores viven en
 * `src/assets/css/input.css`. Nada de esto toca datos ni permisos.
 */
(function () {
    var STORAGE_KEY = "marga-theme";
    var root = document.documentElement;
    var media = window.matchMedia
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;

    /**
     * Las páginas de venta y los textos legales se quedan siempre en claro:
     * se diseñaron con esa paleta y no tienen interruptor visible.
     */
    if (root.getAttribute("data-theme-lock") === "light") {
        root.classList.remove("dark");
        root.style.colorScheme = "light";

        return;
    }

    function stored() {
        try {
            return window.localStorage.getItem(STORAGE_KEY);
        } catch (error) {
            return null;
        }
    }

    function save(theme) {
        try {
            window.localStorage.setItem(STORAGE_KEY, theme);
        } catch (error) {
            /* Modo privado o almacenamiento bloqueado: el tema dura la sesión. */
        }
    }

    function systemTheme() {
        return media && media.matches ? "dark" : "light";
    }

    function current() {
        return root.classList.contains("dark") ? "dark" : "light";
    }

    function apply(theme, persist) {
        var dark = theme === "dark";

        root.classList.toggle("dark", dark);
        root.style.colorScheme = dark ? "dark" : "light";

        var meta = document.querySelector('meta[name="theme-color"]');

        if (meta) {
            meta.setAttribute("content", dark ? "#0b1220" : "#0c5b4c");
        }

        if (persist) {
            save(theme);
        }
    }

    function toggle() {
        apply(current() === "dark" ? "light" : "dark", true);
    }

    /**
     * El botón puede estar en el encabezado de cualquier pantalla. Se enlaza
     * una sola vez por elemento para que una recarga parcial no lo duplique.
     */
    function bind() {
        document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
            if (button.dataset.themeBound === "1") {
                return;
            }

            button.dataset.themeBound = "1";
            button.addEventListener("click", toggle);
        });
    }

    window.MargaTheme = {
        apply: apply,
        current: current,
        toggle: toggle
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bind);
    } else {
        bind();
    }

    /**
     * Si el usuario no forzó un tema, seguir el cambio del sistema en vivo
     * (por ejemplo, cuando el sistema pasa a modo oscuro al atardecer).
     */
    if (media) {
        media.addEventListener("change", function () {
            if (!stored()) {
                apply(systemTheme(), false);
            }
        });
    }
})();
