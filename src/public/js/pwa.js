/**
 * Registro de la PWA, instalación y suscripción a Web Push.
 *
 * No pide permiso automáticamente: el navegador exige un gesto del usuario.
 */
(function () {
    if (!("serviceWorker" in navigator)) {
        return;
    }

    var installButton = document.getElementById("pwa-install");
    var pushButton = document.getElementById("push-enable");
    var pushTest = document.getElementById("push-test");
    var deferredPrompt = null;
    var registration = null;

    function base64ToUint8Array(base64) {
        var padding = "=".repeat((4 - (base64.length % 4)) % 4);
        var raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
        var output = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
        return output;
    }

    async function updatePushButton() {
        if (!pushButton) return;

        if (!("Notification" in window) || !("PushManager" in window)) {
            pushButton.hidden = true;
            if (pushTest) pushTest.hidden = true;
            return;
        }

        pushButton.hidden = false;

        var subscribed = false;

        if (Notification.permission === "granted") {
            try {
                registration = registration || (await navigator.serviceWorker.ready);
                subscribed = Boolean(
                    await registration.pushManager.getSubscription()
                );
            } catch (_) {
                subscribed = false;
            }
        }

        pushButton.textContent = subscribed
            ? "Avisos activos"
            : Notification.permission === "denied"
              ? "Avisos bloqueados"
              : "Activar avisos";

        if (pushTest) {
            pushTest.hidden = !subscribed;
        }
    }

    async function subscribe() {
        var keyResponse = await fetch("/api/push/public-key", {
            credentials: "same-origin"
        });

        if (!keyResponse.ok) {
            throw new Error("Web Push no está configurado.");
        }

        var keyData = await keyResponse.json();
        registration = registration || (await navigator.serviceWorker.ready);

        var existing = await registration.pushManager.getSubscription();

        if (!existing) {
            existing = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: base64ToUint8Array(keyData.publicKey)
            });
        }

        var response = await fetch("/api/push/subscribe", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(existing.toJSON())
        });

        if (!response.ok) {
            throw new Error("No se pudo guardar la suscripción.");
        }

        await updatePushButton();
        return existing;
    }

    navigator.serviceWorker
        .register("/sw.js")
        .then(function (value) {
            registration = value;
        })
        .catch(function () {
            /* Sin service worker no hay push, pero la app sigue funcionando. */
        });

    var isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;
    var isMobile = /iphone|ipad|ipod|android/i.test(
        window.navigator.userAgent || ""
    );

    window.addEventListener("beforeinstallprompt", function (event) {
        event.preventDefault();
        deferredPrompt = event;
        if (installButton) installButton.hidden = false;
    });

    if (installButton && isMobile && !isStandalone) {
        installButton.hidden = false;
    }

    if (installButton) {
        installButton.addEventListener("click", async function () {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                await deferredPrompt.userChoice;
                deferredPrompt = null;
                installButton.hidden = true;
                return;
            }

            window.alert(
                /iphone|ipad|ipod/i.test(window.navigator.userAgent)
                    ? "Para instalar en iPhone: abre esta pagina en Safari, toca Compartir y elige Agregar a pantalla de inicio."
                    : "Para instalar: abre el menu del navegador y elige Instalar app o Agregar a pantalla de inicio."
            );
        });
    }

    if (pushButton) {
        pushButton.addEventListener("click", function () {
            if (!("Notification" in window) || !("PushManager" in window)) {
                return;
            }

            Notification.requestPermission()
                .then(function (permission) {
                    if (permission !== "granted") {
                        pushButton.textContent = "Avisos bloqueados";
                        return;
                    }
                    return subscribe().catch(function () {
                        pushButton.textContent = "No se pudo activar";
                    });
                })
                .catch(function () {
                    pushButton.textContent = "No se pudo activar";
                });
        });
    }

    if (pushTest) {
        pushTest.addEventListener("click", async function () {
            try {
                await subscribe();
                var response = await fetch("/api/push/test", {
                    method: "POST",
                    credentials: "same-origin"
                });
                var result = await response.json().catch(function () {
                    return {};
                });

                if (!response.ok) {
                    throw new Error(result.error || "No se pudo enviar la prueba.");
                }

                if (result.sent === 0) {
                    throw new Error(
                        "El navegador no tiene una suscripción activa. Vuelve a pulsar Activar avisos."
                    );
                }

                pushButton.textContent = "Prueba enviada";
            } catch (error) {
                window.alert(
                    error && error.message
                        ? error.message
                        : "No se pudo enviar la notificación de prueba."
                );
            }
        });
    }

    updatePushButton();
})();
