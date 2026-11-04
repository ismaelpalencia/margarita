/**
 * Actualizaciones en vivo para las bandejas de conversaciones.
 *
 * Páginas soportadas (se activan con atributos en <body>):
 *   data-live-page="conversation" + data-conversation-id="..."
 *   data-live-page="inbox"
 */
(function () {
    "use strict";

    if (typeof window.io !== "function") {
        return;
    }

    var body = document.body;
    var page = body ? body.dataset.livePage : null;

    if (!page) {
        return;
    }

    var conversationId = body.dataset.conversationId || null;
    var basePath = body.dataset.liveBase || null;
    var onlyForUserId = body.dataset.liveUserId || null;
    var hasConnectedBefore = false;
    var toastContainer = null;

    var socket = window.io({
        withCredentials: true
    });

    function formatDate(value) {
        var date = new Date(value);

        if (isNaN(date.getTime())) {
            return "";
        }

        return date.toLocaleString("es-MX");
    }

    function formatTime(value) {
        var date = new Date(value);

        if (isNaN(date.getTime())) {
            return "";
        }

        return date.toLocaleTimeString("es-MX", {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    var TICKS = {
        CREATED: "🕓",
        SENDING: "🕓",
        SENT: "✓",
        DELIVERED: "✓✓",
        READ: "✓✓",
        FAILED: "⚠"
    };

    var TICK_LABELS = {
        CREATED: "Pendiente",
        SENDING: "Enviando",
        SENT: "Enviado",
        DELIVERED: "Entregado",
        READ: "Leído",
        FAILED: "No entregado"
    };

    function applyStatus(element, status) {
        element.textContent = TICKS[status] || "🕓";
        element.title = TICK_LABELS[status] || status;
    }

    function ensureToastContainer() {
        if (toastContainer) {
            return toastContainer;
        }

        toastContainer = document.createElement("div");
        toastContainer.className =
            "fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-3";
        document.body.appendChild(toastContainer);

        return toastContainer;
    }

    function showToast(options) {
        var container = ensureToastContainer();
        var toast = document.createElement("div");
        toast.className =
            "rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg";

        var title = document.createElement("p");
        title.className = "font-semibold";
        title.textContent = options.title;

        var detail = document.createElement("p");
        detail.className = "mt-1 text-xs text-slate-300";
        detail.textContent = options.detail || "";

        toast.appendChild(title);
        toast.appendChild(detail);

        if (options.href) {
            var link = document.createElement("a");
            link.href = options.href;
            link.className =
                "mt-2 inline-block text-xs font-semibold text-margarita-300 hover:text-margarita-200";
            link.textContent = "Abrir conversación";
            toast.appendChild(link);
        }

        container.appendChild(toast);

        window.setTimeout(function () {
            toast.remove();
        }, 8000);
    }

    function buildMessageBubble(message) {
        var isOut = message.direction === "OUT";
        var isNote = message.isInternalNote === true;
        var mediaTypes = ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT"];
        var hasMedia = mediaTypes.indexOf(message.type) >= 0;
        var body = message.body || "";
        var isPlaceholder = body.length > 1 && body.charAt(0) === "[" && body.charAt(body.length - 1) === "]";

        var wrapper = document.createElement("div");
        wrapper.className = "flex " + (isOut ? "justify-end" : "justify-start");
        wrapper.dataset.messageId = message.id;

        var bubble = document.createElement("div");
        bubble.className =
            "max-w-[75%] rounded-2xl px-4 py-3 shadow-sm " +
            (isNote
                ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200"
                : isOut
                  ? "bg-margarita-600 text-white"
                  : "bg-white text-slate-800");

        if (isNote) {
            var noteLabel = document.createElement("p");
            noteLabel.className =
                "mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-700";
            noteLabel.textContent = "Nota interna · solo la ve el equipo";
            bubble.appendChild(noteLabel);
        }

        if (message.source === "AUTOMATIC" && message.aiSuggestionId) {
            var aiLabel = document.createElement("p");
            aiLabel.className =
                "mb-1 text-[10px] font-bold uppercase tracking-wide opacity-80";
            aiLabel.textContent = "IA automática";
            bubble.appendChild(aiLabel);
        }

        if (hasMedia) {
            bubble.appendChild(buildMediaElement(message));
        }

        if (body !== "" && !(hasMedia && isPlaceholder)) {
            var content = document.createElement("p");
            content.className = "whitespace-pre-line text-sm" + (hasMedia ? " mt-2" : "");
            content.textContent = body;
            bubble.appendChild(content);
        } else if (!hasMedia) {
            var fallback = document.createElement("p");
            fallback.className = "whitespace-pre-line text-sm";
            fallback.textContent = "[" + message.type + "]";
            bubble.appendChild(fallback);
        }

        var meta = document.createElement("p");
        meta.className =
            "mt-2 text-right text-[11px] " +
            (isNote ? "text-amber-600" : isOut ? "text-margarita-100" : "text-slate-400");
        meta.textContent = formatTime(message.createdAt) + " ";

        if (isNote) {
            var noteIcon = document.createElement("span");
            noteIcon.textContent = "📝";
            meta.appendChild(noteIcon);
        } else {
            var status = document.createElement("span");
            status.dataset.messageStatus = "";
            status.className = isOut ? "text-margarita-100 font-semibold" : "text-slate-400 font-semibold";
            applyStatus(status, message.status);

            meta.appendChild(status);
        }
        bubble.appendChild(meta);
        wrapper.appendChild(bubble);

        return wrapper;
    }

    /**
     * Multimedia del mensaje. El navegador pide /media/{id} y el servidor
     * descarga de Meta la primera vez, validando que el usuario pueda ver
     * esa conversación.
     */
    function buildMediaElement(message) {
        var url = "/media/" + encodeURIComponent(message.id);

        if (message.type === "IMAGE") {
            var link = document.createElement("a");
            link.href = url;
            link.target = "_blank";
            link.rel = "noopener";

            var image = document.createElement("img");
            image.src = url;
            image.alt = "Imagen recibida";
            image.loading = "lazy";
            image.className = "max-h-72 w-auto max-w-full rounded-xl";

            link.appendChild(image);
            return link;
        }

        if (message.type === "VIDEO") {
            var video = document.createElement("video");
            video.controls = true;
            video.preload = "metadata";
            video.src = url;
            video.className = "max-h-72 w-full rounded-xl";
            return video;
        }

        if (message.type === "AUDIO") {
            var audio = document.createElement("audio");
            audio.controls = true;
            audio.preload = "none";
            audio.src = url;
            audio.className = "w-full max-w-xs";
            return audio;
        }

        var file = document.createElement("a");
        file.href = url + "?download=1";
        file.className =
            "flex items-center gap-2 rounded-xl bg-black/5 px-3 py-2 text-sm font-semibold";
        file.textContent = "📄 " + (message.body || "Documento");

        return file;
    }

    /**
     * Suma al aviso de mensajes sin leer del encabezado. El valor de la
     * página es el que calculó el servidor al renderizar; a partir de ahí
     * se va sumando con cada mensaje entrante que llega en vivo.
     */
    function bumpUnreadBadge(amount) {
        var badge = document.querySelector("[data-unread-badge]");

        if (!badge) {
            return;
        }

        var current = Number(badge.getAttribute("data-count"));

        if (!isFinite(current)) {
            current = 0;
        }

        var next = current + amount;

        if (next < 0) {
            next = 0;
        }

        badge.setAttribute("data-count", String(next));
        badge.textContent = String(next);
        badge.classList.toggle("hidden", next === 0);
    }

    function appendMessage(message) {
        var container = document.querySelector("[data-live-messages]");

        if (!container) {
            return;
        }

        if (container.querySelector('[data-message-id="' + message.id + '"]')) {
            return;
        }

        var placeholder = container.querySelector("[data-live-empty]");

        if (placeholder) {
            placeholder.remove();
        }

        /**
         * El hilo tiene su propio scroll, así que se mide ahí y no en la
         * ventana. Solo se baja solo si el usuario ya estaba al final,
         * para no interrumpirlo si está leyendo mensajes anteriores.
         */
        var shouldStickToBottom =
            container.scrollHeight - container.scrollTop - container.clientHeight < 140;

        container.appendChild(buildMessageBubble(message));

        if (shouldStickToBottom) {
            scrollThreadToBottom(container, true);
        }
    }

    function scrollThreadToBottom(container, smooth) {
        container.scrollTo({
            top: container.scrollHeight,
            behavior: smooth ? "smooth" : "auto"
        });
    }

    function updateMessageStatus(payload) {
        var statusElement = document.querySelector(
            '[data-message-id="' + payload.messageId + '"] [data-message-status]'
        );

        if (statusElement) {
            applyStatus(statusElement, payload.status);
        }
    }

    socket.on("connect", function () {
        if (hasConnectedBefore && page === "conversation") {
            /**
             * Al reconectar pudimos perder eventos, así que rehidratamos
             * la conversación para no dejar huecos en el hilo.
             */
            window.location.reload();
            return;
        }

        hasConnectedBefore = true;
    });

    /**
     * Al abrir la conversación se muestra el final del hilo, como en
     * cualquier chat: sin esto se ve el principio y parece que no hay
     * mensajes nuevos.
     */
    if (page === "conversation") {
        var thread = document.querySelector("[data-live-messages]");

        if (thread) {
            scrollThreadToBottom(thread, false);

            /* Las imágenes cargan después y cambian la altura. */
            window.addEventListener("load", function () {
                scrollThreadToBottom(thread, false);
            });

            setTimeout(function () {
                scrollThreadToBottom(thread, false);
            }, 300);
        }
    }

    /**
     * La pausa, la reactivación y la entrega a una persona cambian los
     * controles del encabezado. Se recarga el hilo para no mostrar un botón
     * que ya no aplica.
     */
    [
        "conversation:ai-paused",
        "conversation:ai-resumed",
        "conversation:ai-handoff"
    ].forEach(function (eventName) {
        socket.on(eventName, function (payload) {
            if (
                page === "conversation" &&
                payload &&
                payload.conversationId === conversationId
            ) {
                window.location.reload();
            }
        });
    });

    socket.on("conversation:message", function (payload) {
        if (!payload || !payload.message) {
            return;
        }

        var isThisConversation =
            page === "conversation" &&
            payload.conversationId === conversationId;

        /**
         * Si el cliente acaba de pedir la baja, se recarga el hilo para
         * que aparezca el aviso y desaparezca la barra de envío.
         */
        if (isThisConversation && payload.contactOptedOut) {
            window.location.reload();
            return;
        }

        if (isThisConversation) {
            appendMessage(payload.message);
            return;
        }

        if (payload.message.direction !== "IN") {
            return;
        }

        bumpUnreadBadge(1);

        /**
         * En la bandeja del agente solo avisamos de lo que puede atender.
         */
        if (onlyForUserId && payload.assignedUserId !== onlyForUserId) {
            return;
        }

        var contactName = payload.contact ? payload.contact.name : "Contacto";

        showToast({
            title: "Nuevo mensaje de " + contactName,
            detail: payload.message.body || "[" + payload.message.type + "]",
            href:
                basePath && payload.conversationId
                    ? basePath + "/" + payload.conversationId
                    : null
        });
    });

    socket.on("message:status", function (payload) {
        if (page !== "conversation" || !payload) {
            return;
        }

        if (payload.conversationId !== conversationId) {
            return;
        }

        updateMessageStatus(payload);
    });

    socket.on("conversation:assigned", function (payload) {
        if (!payload) {
            return;
        }

        if (page === "conversation" && payload.conversationId === conversationId) {
            window.location.reload();
            return;
        }

        if (payload.agentName) {
            showToast({
                title: "Conversación asignada",
                detail: "Asignada a " + payload.agentName
            });
        }
    });
})();

/**
 * Atajo del compositor: **Enter envía**, **Shift+Enter** hace un salto de
 * línea. Es lo que espera cualquiera que haya usado un chat, y evita el viaje
 * al botón con el mouse en cada mensaje.
 *
 * Se escucha en el documento porque el compositor se reemplaza al actualizar
 * el hilo en vivo.
 */
document.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
        return;
    }

    var composer = event.target.closest("#composer-body");

    if (!composer) {
        return;
    }

    var form = composer.closest("form");

    if (!form) {
        return;
    }

    event.preventDefault();

    if (form.requestSubmit) {
        form.requestSubmit();
    } else {
        form.submit();
    }
});
