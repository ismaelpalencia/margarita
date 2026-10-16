/**
 * Códigos QR para la activación de la verificación en dos pasos.
 *
 * ¿Por qué escrito a mano, con lo enredado que es un QR? Porque el caso de
 * uso es uno solo (pasar la clave de configuración a la app de autenticación)
 * y así no se suma una dependencia al despliegue ni un paquete que reciba
 * actualizaciones de seguridad cada mes. Son ~300 líneas y una tabla.
 *
 * Lo que se respeta es el estándar (ISO/IEC 18004), no una versión propia:
 *
 * - Modo byte (UTF-8), que es lo que necesita una URL `otpauth://`.
 * - Corrección de errores Reed-Solomon sobre GF(256), niveles `L` y `M`.
 * - Versiones 1 a 20 (hasta 858 caracteres en nivel M: de sobra).
 * - Selección del mejor enmascaramiento por las cuatro reglas de penalización.
 *
 * **Verificación**: cada matriz se comparó carácter por carácter contra la
 * implementación de referencia de Python (`qrcode`) forzando versión, nivel y
 * máscara, así que la codificación, la colocación y los patrones están
 * comprobados bit a bit. Las pruebas de `qr.test.ts` guardan las huellas de
 * esos casos para que un cambio futuro no pase inadvertido.
 */

export type QrLevel = "L" | "M";

/**
 * [bloques, codewords por bloque, codewords de datos por bloque].
 *
 * Tabla 9 de ISO/IEC 18004 para los niveles L y M. Cuando una versión tiene
 * dos grupos, se guardan las dos líneas. Las de corrección de errores por
 * bloque salen de restar: total − datos.
 */
type BlockGroup = [blocks: number, total: number, data: number];

const RS_BLOCKS: Record<number, Record<QrLevel, BlockGroup[]>> = {
    1: { L: [[1, 26, 19]], M: [[1, 26, 16]] },
    2: { L: [[1, 44, 34]], M: [[1, 44, 28]] },
    3: { L: [[1, 70, 55]], M: [[1, 70, 44]] },
    4: { L: [[1, 100, 80]], M: [[2, 50, 32]] },
    5: { L: [[1, 134, 108]], M: [[2, 67, 43]] },
    6: { L: [[2, 86, 68]], M: [[4, 43, 27]] },
    7: { L: [[2, 98, 78]], M: [[4, 49, 31]] },
    8: { L: [[2, 121, 97]], M: [[2, 60, 38], [2, 61, 39]] },
    9: { L: [[2, 146, 116]], M: [[3, 58, 36], [2, 59, 37]] },
    10: {
        L: [[2, 86, 68], [2, 87, 69]],
        M: [[4, 69, 43], [1, 70, 44]]
    },
    11: { L: [[4, 101, 81]], M: [[1, 80, 50], [4, 81, 51]] },
    12: {
        L: [[2, 116, 92], [2, 117, 93]],
        M: [[6, 58, 36], [2, 59, 37]]
    },
    13: { L: [[4, 133, 107]], M: [[8, 59, 37], [1, 60, 38]] },
    14: {
        L: [[3, 145, 115], [1, 146, 116]],
        M: [[4, 64, 40], [5, 65, 41]]
    },
    15: {
        L: [[5, 109, 87], [1, 110, 88]],
        M: [[5, 65, 41], [5, 66, 42]]
    },
    16: {
        L: [[5, 122, 98], [1, 123, 99]],
        M: [[7, 73, 45], [3, 74, 46]]
    },
    17: {
        L: [[1, 135, 107], [5, 136, 108]],
        M: [[10, 74, 46], [1, 75, 47]]
    },
    18: {
        L: [[5, 150, 120], [1, 151, 121]],
        M: [[9, 69, 43], [4, 70, 44]]
    },
    19: {
        L: [[3, 141, 113], [4, 142, 114]],
        M: [[3, 70, 44], [11, 71, 45]]
    },
    20: {
        L: [[3, 135, 107], [5, 136, 108]],
        M: [[3, 67, 41], [13, 68, 42]]
    }
};

/** Centros de los patrones de alineación (versiones 1 a 20). */
const ALIGNMENT: number[][] = [
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50],
    [6, 30, 54],
    [6, 32, 58],
    [6, 34, 62],
    [6, 26, 46, 66],
    [6, 26, 48, 70],
    [6, 26, 50, 74],
    [6, 30, 54, 78],
    [6, 30, 56, 82],
    [6, 30, 58, 86],
    [6, 34, 62, 90]
];

const MAX_VERSION = 20;

// --- Aritmética de GF(256) ---------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

{
    let value = 1;

    for (let index = 0; index < 255; index += 1) {
        EXP[index] = value;
        LOG[value] = index;

        value <<= 1;

        /** Polinomio primitivo del estándar: x^8 + x^4 + x^3 + x^2 + 1. */
        if (value & 0x100) {
            value ^= 0x11d;
        }
    }

    for (let index = 255; index < 512; index += 1) {
        EXP[index] = EXP[index - 255];
    }
}

function multiply(left: number, right: number): number {
    if (left === 0 || right === 0) {
        return 0;
    }

    return EXP[LOG[left] + LOG[right]];
}

/** Polinomio generador de Reed-Solomon para una longitud dada. */
function generatorPolynomial(degree: number): number[] {
    let polynomial = [1];

    for (let index = 0; index < degree; index += 1) {
        const next = new Array<number>(polynomial.length + 1).fill(0);

        for (let position = 0; position < polynomial.length; position += 1) {
            next[position] ^= polynomial[position];
            next[position + 1] ^= multiply(polynomial[position], EXP[index]);
        }

        polynomial = next;
    }

    return polynomial;
}

/** Codewords de corrección: el resto de dividir los datos entre el generador. */
function errorCorrection(data: number[], degree: number): number[] {
    const generator = generatorPolynomial(degree);
    const remainder = [...data, ...new Array<number>(degree).fill(0)];

    for (let position = 0; position < data.length; position += 1) {
        const factor = remainder[position];

        if (factor === 0) {
            continue;
        }

        for (let index = 0; index < generator.length; index += 1) {
            remainder[position + index] ^= multiply(generator[index], factor);
        }
    }

    return remainder.slice(data.length);
}

// --- Codificación de los datos ------------------------------------------

function dataCapacity(version: number, level: QrLevel): number {
    return RS_BLOCKS[version][level].reduce(
        (total, [blocks, , data]) => total + blocks * data,
        0
    );
}

/** Versión más pequeña en la que caben los bytes, o `null`. */
export function qrVersionFor(length: number, level: QrLevel): number | null {
    for (let version = 1; version <= MAX_VERSION; version += 1) {
        if (dataCapacity(version, level) >= length) {
            return version;
        }
    }

    return null;
}

function buildDataCodewords(
    bytes: number[],
    version: number,
    level: QrLevel
): number[] {
    const capacity = dataCapacity(version, level);
    const countBits = version < 10 ? 8 : 16;
    const bits: number[] = [];

    const push = (value: number, length: number) => {
        for (let index = length - 1; index >= 0; index -= 1) {
            bits.push((value >>> index) & 1);
        }
    };

    /** Modo byte, longitud y contenido. */
    push(0b0100, 4);
    push(bytes.length, countBits);

    for (const byte of bytes) {
        push(byte, 8);
    }

    /** Terminador y relleno hasta el siguiente byte. */
    push(0, Math.min(4, capacity * 8 - bits.length));

    while (bits.length % 8 !== 0) {
        bits.push(0);
    }

    const codewords: number[] = [];

    for (let index = 0; index < bits.length; index += 8) {
        let byte = 0;

        for (let offset = 0; offset < 8; offset += 1) {
            byte = (byte << 1) | bits[index + offset];
        }

        codewords.push(byte);
    }

    /** Relleno alternando 0xEC y 0x11, como manda el estándar. */
    let pad = 0xec;

    while (codewords.length < capacity) {
        codewords.push(pad);
        pad = pad === 0xec ? 0x11 : 0xec;
    }

    return codewords;
}

/** Datos y corrección entrelazados, listos para colocarse. */
function interleave(data: number[], version: number, level: QrLevel): number[] {
    const dataBlocks: number[][] = [];
    const ecBlocks: number[][] = [];
    let offset = 0;

    for (const [blocks, total, size] of RS_BLOCKS[version][level]) {
        for (let index = 0; index < blocks; index += 1) {
            const block = data.slice(offset, offset + size);

            offset += size;
            dataBlocks.push(block);
            ecBlocks.push(errorCorrection(block, total - size));
        }
    }

    const result: number[] = [];
    const longestData = Math.max(...dataBlocks.map((block) => block.length));

    for (let index = 0; index < longestData; index += 1) {
        for (const block of dataBlocks) {
            if (index < block.length) {
                result.push(block[index]);
            }
        }
    }

    const longestEc = Math.max(...ecBlocks.map((block) => block.length));

    for (let index = 0; index < longestEc; index += 1) {
        for (const block of ecBlocks) {
            if (index < block.length) {
                result.push(block[index]);
            }
        }
    }

    return result;
}

function toBits(codewords: number[]): number[] {
    const bits: number[] = [];

    for (const codeword of codewords) {
        for (let index = 7; index >= 0; index -= 1) {
            bits.push((codeword >>> index) & 1);
        }
    }

    return bits;
}

// --- Matriz --------------------------------------------------------------

function bitLength(value: number): number {
    let length = 0;

    while (value !== 0) {
        length += 1;
        value >>>= 1;
    }

    return length;
}

/** Información de formato: 5 bits de datos + BCH(15,5) y máscara fija. */
function formatInfo(level: QrLevel, mask: number): number {
    const data = ((level === "L" ? 0b01 : 0b00) << 3) | mask;
    let value = data << 10;

    while (bitLength(value) >= 11) {
        value ^= 0b10100110111 << (bitLength(value) - 11);
    }

    return ((data << 10) | value) ^ 0b101010000010010;
}

/** Información de versión (solo desde la 7): 6 bits + BCH(18,6). */
function versionInfo(version: number): number {
    let value = version << 12;

    while (bitLength(value) >= 13) {
        value ^= 0b1111100100101 << (bitLength(value) - 13);
    }

    return (version << 12) | value;
}

function maskCondition(mask: number, row: number, column: number): boolean {
    switch (mask) {
        case 0:
            return (row + column) % 2 === 0;
        case 1:
            return row % 2 === 0;
        case 2:
            return column % 3 === 0;
        case 3:
            return (row + column) % 3 === 0;
        case 4:
            return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
        case 5:
            return ((row * column) % 2) + ((row * column) % 3) === 0;
        case 6:
            return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0;
        default:
            return (((row + column) % 2) + ((row * column) % 3)) % 2 === 0;
    }
}

function emptyMatrix(size: number, fill: boolean): boolean[][] {
    return Array.from({ length: size }, () =>
        new Array<boolean>(size).fill(fill)
    );
}

/**
 * Matriz completa para una versión, nivel y máscara concretos. Se expone
 * (sin exportar) para poder comparar contra la implementación de referencia.
 */
function buildMatrix(
    bytes: number[],
    version: number,
    level: QrLevel,
    mask: number
): boolean[][] {
    const size = 17 + version * 4;
    const modules = emptyMatrix(size, false);
    const reserved = emptyMatrix(size, false);

    const set = (row: number, column: number, dark: boolean) => {
        if (row < 0 || column < 0 || row >= size || column >= size) {
            return;
        }

        modules[row][column] = dark;
        reserved[row][column] = true;
    };

    /** Patrones de localización con su separador. */
    const placeFinder = (row: number, column: number) => {
        for (let offsetRow = -1; offsetRow <= 7; offsetRow += 1) {
            for (let offsetColumn = -1; offsetColumn <= 7; offsetColumn += 1) {
                const inside =
                    offsetRow >= 0 &&
                    offsetRow <= 6 &&
                    offsetColumn >= 0 &&
                    offsetColumn <= 6;
                const border =
                    offsetRow === 0 ||
                    offsetRow === 6 ||
                    offsetColumn === 0 ||
                    offsetColumn === 6;
                const core =
                    offsetRow >= 2 &&
                    offsetRow <= 4 &&
                    offsetColumn >= 2 &&
                    offsetColumn <= 4;

                set(
                    row + offsetRow,
                    column + offsetColumn,
                    inside && (border || core)
                );
            }
        }
    };

    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    /** Patrones de alineación (menos los que caen sobre los de localización). */
    const positions = ALIGNMENT[version - 1];

    for (const row of positions) {
        for (const column of positions) {
            const nearFinder =
                (row <= 8 && column <= 8) ||
                (row <= 8 && column >= size - 9) ||
                (row >= size - 9 && column <= 8);

            if (nearFinder) {
                continue;
            }

            for (let offsetRow = -2; offsetRow <= 2; offsetRow += 1) {
                for (let offsetColumn = -2; offsetColumn <= 2; offsetColumn += 1) {
                    const ring =
                        Math.max(Math.abs(offsetRow), Math.abs(offsetColumn));

                    set(row + offsetRow, column + offsetColumn, ring !== 1);
                }
            }
        }
    }

    /** Patrones de sincronía. */
    for (let index = 8; index < size - 8; index += 1) {
        set(6, index, index % 2 === 0);
        set(index, 6, index % 2 === 0);
    }

    /** Módulo oscuro fijo. */
    set(size - 8, 8, true);

    /**
     * Zonas del formato (dos copias), reservadas para escribirlas al final.
     *
     * Cuidado con los cruces: la fila 6 y la columna 6 llevan el patrón de
     * sincronía, así que las tiras de formato las rodean. Y la celda
     * `(size - 8, 8)` es el módulo oscuro fijo, que **no** se puede pisar (fue
     * justo el error que encontró la comparación contra la referencia).
     */
    for (let index = 0; index <= 8; index += 1) {
        if (index === 6) {
            continue;
        }

        set(8, index, false);
        set(index, 8, false);
    }

    for (let index = 0; index < 8; index += 1) {
        set(8, size - 1 - index, false);
    }

    for (let index = 0; index < 7; index += 1) {
        set(size - 1 - index, 8, false);
    }

    if (version >= 7) {
        for (let index = 0; index < 6; index += 1) {
            for (let offset = 0; offset < 3; offset += 1) {
                set(index, size - 11 + offset, false);
                set(size - 11 + offset, index, false);
            }
        }
    }

    /** Colocación de los datos en zigzag, de abajo hacia arriba. */
    const bits = toBits(interleave(buildDataCodewords(bytes, version, level), version, level));
    let bitIndex = 0;
    let upwards = true;

    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) {
            right = 5;
        }

        for (let step = 0; step < size; step += 1) {
            const row = upwards ? size - 1 - step : step;

            for (const column of [right, right - 1]) {
                if (reserved[row][column]) {
                    continue;
                }

                const dark = bitIndex < bits.length && bits[bitIndex] === 1;

                bitIndex += 1;
                modules[row][column] = dark;
            }
        }

        upwards = !upwards;
    }

    /** Enmascaramiento: solo sobre los módulos de datos. */
    for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
            if (!reserved[row][column] && maskCondition(mask, row, column)) {
                modules[row][column] = !modules[row][column];
            }
        }
    }

    /** Información de formato (dos copias). */
    const format = formatInfo(level, mask);

    for (let index = 0; index < 15; index += 1) {
        const dark = ((format >> index) & 1) === 1;

        if (index < 6) {
            modules[index][8] = dark;
        } else if (index < 8) {
            modules[index + 1][8] = dark;
        } else {
            modules[size - 15 + index][8] = dark;
        }

        if (index < 8) {
            modules[8][size - index - 1] = dark;
        } else if (index === 8) {
            modules[8][7] = dark;
        } else {
            modules[8][14 - index] = dark;
        }
    }

    /** Información de versión (dos copias), desde la versión 7. */
    if (version >= 7) {
        const info = versionInfo(version);

        for (let index = 0; index < 18; index += 1) {
            const dark = ((info >> index) & 1) === 1;
            const row = Math.floor(index / 3);
            const column = (index % 3) + size - 11;

            modules[row][column] = dark;
            modules[column][row] = dark;
        }
    }

    return modules;
}

/** Reglas de penalización del estándar; se elige la máscara con menos puntos. */
function penalty(modules: boolean[][]): number {
    const size = modules.length;
    let score = 0;

    /** Regla 1: rachas de cinco o más módulos iguales. */
    const runScore = (run: number) => (run >= 5 ? 3 + (run - 5) : 0);

    for (let index = 0; index < size; index += 1) {
        let rowRun = 1;
        let columnRun = 1;

        for (let position = 1; position < size; position += 1) {
            rowRun =
                modules[index][position] === modules[index][position - 1]
                    ? rowRun + 1
                    : (score += runScore(rowRun), 1);
            columnRun =
                modules[position][index] === modules[position - 1][index]
                    ? columnRun + 1
                    : (score += runScore(columnRun), 1);
        }

        score += runScore(rowRun) + runScore(columnRun);
    }

    /** Regla 2: bloques de 2x2 del mismo color. */
    for (let row = 0; row < size - 1; row += 1) {
        for (let column = 0; column < size - 1; column += 1) {
            const value = modules[row][column];

            if (
                value === modules[row][column + 1] &&
                value === modules[row + 1][column] &&
                value === modules[row + 1][column + 1]
            ) {
                score += 3;
            }
        }
    }

    /** Regla 3: patrón 1:1:3:1:1 con cuatro módulos claros al lado. */
    const pattern = [true, false, true, true, true, false, true];
    const before = [false, false, false, false];
    const after = [false, false, false, false];

    const matches = (values: boolean[], start: number, goal: boolean[]) =>
        goal.every((value, index) => values[start + index] === value);

    for (let index = 0; index < size; index += 1) {
        const row = modules[index];
        const column = modules.map((line) => line[index]);

        for (let start = 0; start + 11 <= size; start += 1) {
            for (const line of [row, column]) {
                const head = [...before, ...pattern];
                const tail = [...pattern, ...after];

                if (
                    matches(line, start, head) ||
                    matches(line, start, tail)
                ) {
                    score += 40;
                }
            }
        }
    }

    /** Regla 4: desviación del 50% de módulos oscuros. */
    let dark = 0;

    for (const row of modules) {
        for (const value of row) {
            if (value) {
                dark += 1;
            }
        }
    }

    const ratio = (dark * 100) / (size * size);

    score += Math.floor(Math.abs(ratio - 50) / 5) * 10;

    return score;
}

export type QrCode = {
    version: number;
    level: QrLevel;
    mask: number;
    size: number;
    modules: boolean[][];
};

/**
 * Codifica un texto. Se queda con el nivel `M` (más resistente) si cabe y, si
 * no, con `L`; el texto tiene que caber en la versión 20.
 */
export function encodeQr(text: string, level?: QrLevel): QrCode {
    const bytes = Array.from(Buffer.from(text, "utf8"));
    const levels: QrLevel[] = level ? [level] : ["M", "L"];

    for (const candidate of levels) {
        const version = qrVersionFor(bytes.length, candidate);

        if (version === null) {
            continue;
        }

        let best = { mask: 0, score: Number.POSITIVE_INFINITY, modules: [] as boolean[][] };

        for (let mask = 0; mask < 8; mask += 1) {
            const modules = buildMatrix(bytes, version, candidate, mask);
            const score = penalty(modules);

            if (score < best.score) {
                best = { mask, score, modules };
            }
        }

        return {
            version,
            level: candidate,
            mask: best.mask,
            size: 17 + version * 4,
            modules: best.modules
        };
    }

    throw new Error("El texto es demasiado largo para un código QR.");
}

/**
 * Matriz con versión, nivel y máscara fijos. Sirve para comprobar la
 * codificación contra la implementación de referencia, sin depender de cómo
 * se elige la máscara.
 */
export function qrMatrix(
    text: string,
    options: { version: number; level: QrLevel; mask: number }
): boolean[][] {
    return buildMatrix(
        Array.from(Buffer.from(text, "utf8")),
        options.version,
        options.level,
        options.mask
    );
}

/**
 * El código como SVG, con un `<path>` por filas (mucho más pequeño que un
 * rectángulo por módulo) y sin fondo, para que herede el del contenedor.
 */
export function qrSvg(
    text: string,
    options: { size?: number; margin?: number; color?: string } = {}
): string {
    const code = encodeQr(text);
    const margin = options.margin ?? 2;
    const size = options.size ?? 240;
    const color = options.color ?? "#0f4632";
    const total = code.size + margin * 2;
    const commands: string[] = [];

    for (let row = 0; row < code.size; row += 1) {
        let column = 0;

        while (column < code.size) {
            if (!code.modules[row][column]) {
                column += 1;
                continue;
            }

            let length = 1;

            while (
                column + length < code.size &&
                code.modules[row][column + length]
            ) {
                length += 1;
            }

            commands.push(
                `M${column + margin} ${row + margin}h${length}v1h-${length}z`
            );
            column += length;
        }
    }

    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" ` +
        `width="${size}" height="${size}" shape-rendering="crispEdges" role="img" ` +
        `aria-label="Código QR para configurar la verificación en dos pasos">` +
        `<path d="${commands.join("")}" fill="${color}"/></svg>`
    );
}
