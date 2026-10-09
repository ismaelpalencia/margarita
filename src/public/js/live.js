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
                "mt-2 inline-block text-xs font-semibold text-emerald-300 hover:text-emerald-200";
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

        var wrapper = document.createElement("div");
        wrapper.className = "flex " + (isOut ? "justify-end" : "justify-start");
        wrapper.dataset.messageId = message.id;

        var bubble = document.createElement("div");
        bubble.className =
            "max-w-[75%] rounded-2xl px-4 py-3 shadow-sm " +
            (isOut ? "bg-emerald-600 text-white" : "bg-white text-slate-800");

        var content = document.createElement("p");
        content.className = "whitespace-pre-line text-sm";
        content.textContent = message.body || "[" + message.type + "]";

        var meta = document.createElement("p");
        meta.className =
            "mt-2 text-right text-[11px] " +
            (isOut ? "text-emerald-100" : "text-slate-400");
        meta.textContent = formatDate(message.createdAt) + " · ";

        var status = document.createElement("span");
        status.dataset.messageStatus = "";
        status.textContent = message.status;

        meta.appendChild(status);
        bubble.appendChild(content);
        bubble.appendChild(meta);
        wrapper.appendChild(bubble);

        return wrapper;
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

        var shouldStickToBottom =
            window.innerHeight + window.scrollY >=
            document.body.offsetHeight - 120;

        container.appendChild(buildMessageBubble(message));

        if (shouldStickToBottom) {
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: "smooth"
            });
        }
    }

    function updateMessageStatus(payload) {
        var statusElement = document.querySelector(
            '[data-message-id="' + payload.messageId + '"] [data-message-status]'
        );

        if (statusElement) {
            statusElement.textContent = payload.status;
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

    socket.on("conversation:message", function (payload) {
        if (!payload || !payload.message) {
            return;
        }

        if (page === "conversation" && payload.conversationId === conversationId) {
            appendMessage(payload.message);
            return;
        }

        if (payload.message.direction !== "IN") {
            return;
        }

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
