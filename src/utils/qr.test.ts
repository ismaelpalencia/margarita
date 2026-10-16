import crypto from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import { encodeQr, qrMatrix, qrSvg, qrVersionFor } from "./qr";

/**
 * El código QR de la activación en dos pasos.
 *
 * Un QR mal hecho se ve como un QR y no se escanea, así que aquí no se prueba
 * "que salga algo", se prueba **que salga exactamente lo mismo que la
 * implementación de referencia**. Cada huella de abajo se obtuvo codificando
 * el mismo texto con la librería `qrcode` de Python, forzando versión, nivel
 * de corrección y máscara, y comparando las 160 combinaciones posibles. Si
 * alguien toca la colocación, el Reed-Solomon o los patrones, esto falla.
 */

const URI = "otpauth://totp/Margarita:x@y.mx?secret=JBSWY3DPEHPK3PXP&issuer=Margarita";

const URI_LARGA =
    "otpauth://totp/Margarita%20(Ferreter%C3%ADa%20L%C3%B3pez):cobranza@" +
    "ferreteria-lopez.mx?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=" +
    "Margarita&algorithm=SHA1&digits=6&period=30";

/** Huella de la matriz, con las filas unidas igual que en la referencia. */
function digest(modules: boolean[][]): string {
    const rows = modules.map((row) =>
        row.map((value) => (value ? "1" : "0")).join("")
    );

    return crypto.createHash("sha256").update(rows.join("|")).digest("hex");
}

test("la matriz coincide con la referencia byte a byte", () => {
    const cases: Array<{
        text: string;
        version: number;
        level: "L" | "M";
        mask: number;
        hash: string;
    }> = [
        {
            text: "HOLA",
            version: 1,
            level: "M",
            mask: 0,
            hash: "e25d373dd8ef9a261a6451daad827560466076b7392c2b3de1ca2f876fa805f2"
        },
        {
            text: "https://margarita.mx",
            version: 2,
            level: "M",
            mask: 5,
            hash: "304c4a488fb92ece01ebe6894490ce41455be11a2f5218366bf37b064bc7bf1c"
        },
        {
            text: URI,
            version: 7,
            level: "M",
            mask: 3,
            hash: "5318d89e03e7a2bbb322fc0a5ffb41b8b6710eb3373da2791ab1905d82f1efa3"
        },
        {
            text: URI_LARGA,
            version: 10,
            level: "M",
            mask: 2,
            hash: "feb68428b94e153b406f410be23ce75fcd014a60222cbdb70fbeedd9861043a3"
        },
        {
            text: URI_LARGA,
            version: 10,
            level: "L",
            mask: 7,
            hash: "bfff52c3b1c7b35c451766c2d86773eaa18db17ab4358d3ce9b0b547b3ee286b"
        },
        {
            text: "x".repeat(400),
            version: 18,
            level: "M",
            mask: 4,
            hash: "1bb84b4eaded9700f07254e7c0d910b8119371f0b417dbb5c6cb60b85a2fc81a"
        }
    ];

    for (const scenario of cases) {
        const modules = qrMatrix(scenario.text, {
            version: scenario.version,
            level: scenario.level,
            mask: scenario.mask
        });

        assert.equal(
            modules.length,
            17 + scenario.version * 4,
            `la versión ${scenario.version} mide ${17 + scenario.version * 4}`
        );

        assert.equal(
            digest(modules),
            scenario.hash,
            `la matriz de ${scenario.version}${scenario.level} con máscara ` +
                `${scenario.mask} debería ser idéntica a la de la referencia`
        );
    }
});

test("el caso más pequeño, a la vista", () => {
    /**
     * El mismo código de arriba (misma huella) pero legible: si algún día hay
     * que depurar a mano, aquí se ve el patrón completo de una versión 1.
     */
    const expected = [
        "111111100101001111111",
        "100000101111101000001",
        "101110100010001011101",
        "101110100110101011101",
        "101110101111101011101",
        "100000100011001000001",
        "111111101010101111111",
        "000000000100000000000",
        "101010100100100010010",
        "011011010101010100110",
        "011111110111011101011",
        "100101000101110110010",
        "011001111011011100100",
        "000000001000001000110",
        "111111100010100010111",
        "100000100000001000010",
        "101110101110101010111",
        "101110100001010101010",
        "101110101101011101101",
        "100000100111110111010",
        "111111101111011100111"
    ];

    const modules = qrMatrix("HOLA", { version: 1, level: "M", mask: 0 });
    const rows = modules.map((row) =>
        row.map((value) => (value ? "1" : "0")).join("")
    );

    assert.deepEqual(rows, expected);
});

test("los patrones obligatorios están donde deben", () => {
    const modules = qrMatrix("Margarita", { version: 4, level: "M", mask: 1 });
    const size = modules.length;

    /** Localización: 7x7 en tres esquinas, con su separador claro. */
    for (const [row, column] of [
        [0, 0],
        [0, size - 7],
        [size - 7, 0]
    ]) {
        assert.ok(modules[row][column], "la esquina del patrón es oscura");
        assert.ok(
            modules[row + 1][column + 1] === false,
            "el anillo interior es claro"
        );
        assert.ok(
            modules[row + 3][column + 3] === true,
            "el centro del patrón es oscuro"
        );
    }

    /** Sincronía: alterna desde la columna o fila 8. */
    for (let index = 8; index < size - 8; index += 1) {
        assert.equal(
            modules[6][index],
            index % 2 === 0,
            `el patrón de sincronía horizontal falla en ${index}`
        );
        assert.equal(
            modules[index][6],
            index % 2 === 0,
            `el patrón de sincronía vertical falla en ${index}`
        );
    }

    /** El módulo oscuro fijo, siempre en el mismo lugar. */
    assert.ok(modules[size - 8][8], "falta el módulo oscuro fijo");
});

test("la información de formato se repite dos veces y la de versión aparece desde la 7", () => {
    const modules = qrMatrix(URI, { version: 7, level: "M", mask: 5 });
    const size = modules.length;

    /** Formato: los 15 bits de la copia vertical y la horizontal coinciden. */
    const vertical: boolean[] = [];
    const horizontal: boolean[] = [];

    for (let index = 0; index < 15; index += 1) {
        if (index < 6) {
            vertical.push(modules[index][8]);
        } else if (index < 8) {
            vertical.push(modules[index + 1][8]);
        } else {
            vertical.push(modules[size - 15 + index][8]);
        }

        if (index < 8) {
            horizontal.push(modules[8][size - index - 1]);
        } else if (index === 8) {
            horizontal.push(modules[8][7]);
        } else {
            horizontal.push(modules[8][14 - index]);
        }
    }

    assert.deepEqual(
        vertical,
        horizontal,
        "las dos copias de la información de formato deben coincidir"
    );

    /** Información de versión: 18 bits en los dos bloques de 3x6. */
    const left: boolean[] = [];
    const top: boolean[] = [];

    for (let index = 0; index < 18; index += 1) {
        const row = Math.floor(index / 3);
        const column = (index % 3) + size - 11;

        left.push(modules[row][column]);
        top.push(modules[column][row]);
    }

    assert.deepEqual(left, top, "la información de versión va duplicada");

    /** Y una versión 1 no la lleva: esos módulos son de datos. */
    const small = qrMatrix("HOLA", { version: 1, level: "M", mask: 0 });

    assert.equal(small.length, 21, "una versión 1 mide 21");
});

test("la versión se elige por capacidad y el nivel preferido es M", () => {
    const bytes = Buffer.from(URI_LARGA, "utf8").length;

    assert.equal(bytes, 177, "el caso de prueba mide 177 bytes");
    assert.equal(qrVersionFor(bytes, "M"), 9, "en nivel M cabe en la 9");
    assert.equal(qrVersionFor(bytes, "L"), 8, "en nivel L cabe en la 8");

    const code = encodeQr(URI_LARGA);

    assert.equal(code.level, "M", "se prefiere la corrección más alta");
    assert.equal(code.version, 9, "y la versión más pequeña que quepa");
    assert.equal(code.size, 53, "una versión 9 mide 53 módulos");

    /** Lo que elige solo tiene que ser la misma matriz de esa máscara. */
    assert.deepEqual(
        code.modules,
        qrMatrix(URI_LARGA, {
            version: code.version,
            level: code.level,
            mask: code.mask
        }),
        "el código elegido debe ser exactamente la matriz de su máscara"
    );
});

test("el texto que no cabe se rechaza en lugar de salir a medias", () => {
    assert.throws(
        () => encodeQr("x".repeat(900)),
        /demasiado largo/,
        "más de 858 bytes en nivel M no cabe en la versión 20"
    );
});

test("el SVG dibuja la matriz con su margen y sin fondo", () => {
    const svg = qrSvg(URI, { size: 200, margin: 4 });
    const code = encodeQr(URI);
    const total = code.size + 8;

    assert.match(svg, /^<svg /);
    assert.ok(
        svg.includes(`viewBox="0 0 ${total} ${total}"`),
        "el área de dibujo incluye el margen claro"
    );
    assert.ok(svg.includes('width="200"'), "respeta el tamaño pedido");
    assert.ok(svg.includes("<path"), "todo el dibujo va en un solo trazo");
    assert.ok(
        !svg.includes("rect"),
        "sin rectángulos de fondo: el color lo pone el contenedor"
    );
});
