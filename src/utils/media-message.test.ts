import assert from "node:assert/strict";
import test from "node:test";

import {
    buildMediaMessagePayload,
    classifyUpload,
    normalizeMimeType
} from "./media-message";

test("normaliza el tipo MIME", () => {
    assert.equal(normalizeMimeType("IMAGE/PNG"), "image/png");
    assert.equal(normalizeMimeType("audio/ogg; codecs=opus"), "audio/ogg");
    assert.equal(normalizeMimeType(null), "");
});

test("clasifica imágenes, video, audio y documentos", () => {
    const typeOf = (mimeType: string, filename: string) => {
        const result = classifyUpload({ mimeType, filename });

        assert.equal(result.ok, true);

        return result.ok ? result.value.type : null;
    };

    assert.equal(typeOf("image/jpeg", "f.jpg"), "IMAGE");
    assert.equal(typeOf("image/png", "f.png"), "IMAGE");
    assert.equal(typeOf("video/mp4", "v.mp4"), "VIDEO");
    assert.equal(typeOf("audio/ogg", "a.ogg"), "AUDIO");
    assert.equal(typeOf("application/pdf", "d.pdf"), "DOCUMENT");
    assert.equal(
        typeOf(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "d.xlsx"
        ),
        "DOCUMENT"
    );
});

test("rechaza formatos que Meta no acepta, con motivo claro", () => {
    const result = classifyUpload({ mimeType: "application/x-msdownload", filename: "virus.exe" });

    assert.equal(result.ok, false);
    assert.match(result.reason || "", /no se puede enviar por WhatsApp/);
});

test("cada tipo trae su límite de tamaño", () => {
    const image = classifyUpload({ mimeType: "image/png", filename: "f.png" });
    const doc = classifyUpload({ mimeType: "application/pdf", filename: "d.pdf" });

    assert.equal(image.ok && image.value.maxBytes, 5 * 1024 * 1024);
    assert.equal(doc.ok && doc.value.maxBytes, 100 * 1024 * 1024);
});

test("el payload de imagen incluye el texto solo si existe", () => {
    const withCaption = buildMediaMessagePayload({
        to: "5215500000000",
        type: "IMAGE",
        mediaId: "media-1",
        caption: "  Mira esto  "
    });

    assert.deepEqual(withCaption, {
        messaging_product: "whatsapp",
        to: "5215500000000",
        type: "image",
        image: { id: "media-1", caption: "Mira esto" }
    });

    const withoutCaption = buildMediaMessagePayload({
        to: "5215500000000",
        type: "IMAGE",
        mediaId: "media-1",
        caption: "   "
    });

    assert.equal(withoutCaption.type === "image" && "caption" in withoutCaption.image, false);
});

test("el payload de documento lleva nombre de archivo", () => {
    const payload = buildMediaMessagePayload({
        to: "5215500000000",
        type: "DOCUMENT",
        mediaId: "media-2",
        filename: "cotizacion.pdf",
        caption: "Aquí va la cotización"
    });

    assert.equal(payload.type, "document");
    assert.deepEqual(
        payload.type === "document" ? payload.document : null,
        {
            id: "media-2",
            filename: "cotizacion.pdf",
            caption: "Aquí va la cotización"
        }
    );
});

test("el audio nunca lleva caption", () => {
    const payload = buildMediaMessagePayload({
        to: "5215500000000",
        type: "AUDIO",
        mediaId: "media-3",
        caption: "no debería ir"
    });

    assert.deepEqual(payload, {
        messaging_product: "whatsapp",
        to: "5215500000000",
        type: "audio",
        audio: { id: "media-3" }
    });
});
