/* Service worker mínimo: notificaciones push y apertura de la conversación. */
self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
    let data = {};

    try {
        data = event.data ? event.data.json() : {};
    } catch (_) {
        data = { title: "Margarita", body: "Tienes una notificación nueva." };
    }

    const title = data.title || "Margarita";
    if (data.kind === "call-ended") {
        event.waitUntil(self.registration.getNotifications({ tag: data.tag || `marga-call-${data.callId || ""}` }).then((notifications) => notifications.forEach((notification) => notification.close())));
        return;
    }
    const options = {
        body: data.body || "Tienes una notificación nueva.",
        icon: "/android-chrome-192x192.png?v=2",
        badge: "/favicon-32x32.png",
        tag: data.tag || "marga-notification",
        renotify: true,
        requireInteraction: data.kind === "call",
        vibrate: data.kind === "call" ? [250, 120, 250, 120, 500] : undefined,
        data: {
            url: data.url || "/panel",
            conversationId: data.conversationId || "",
            kind: data.kind || "message",
            callId: data.callId || ""
        }
    };

    event.waitUntil((async () => {
        if (data.kind === "call") {
            const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
            if (clients.some((client) => client.visibilityState === "visible")) return;
        }
        await self.registration.showNotification(title, options);
    })());
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    const target = new URL(
        event.notification.data?.url || "/",
        self.location.origin
    ).toString();

    event.waitUntil(
        self.clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then((clients) => {
                for (const client of clients) {
                    if ("focus" in client && client.url === target) {
                        return client.focus();
                    }
                }

                return self.clients.openWindow(target);
            })
    );
});
