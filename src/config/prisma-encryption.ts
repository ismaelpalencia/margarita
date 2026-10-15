import { PrismaClient } from "@prisma/client";

import {
    blindIndex,
    decryptJson,
    encryptJson,
    encryptSecret,
    isEncrypted,
    isEncryptedJson,
    safeDecryptSecret
} from "../utils/crypto";
import { normalizeEmail } from "../utils/email";

/**
 * Cifrado de campos en reposo, transparente para el resto de la aplicación.
 *
 * El problema: los datos personales (teléfonos, contenido de los mensajes,
 * notas, respuestas de Meta y la bitácora) quedaban escritos en claro en
 * PostgreSQL. Cualquier volcado de la base exponía las conversaciones, y en
 * un producto que se entrega a terceros eso no es aceptable.
 *
 * La solución: una extensión de Prisma que cifra al escribir y descifra al
 * leer. El resto del código sigue trabajando con valores normales: nadie
 * más tiene que llamar a `decryptSecret`.
 *
 * Decisiones de diseño:
 *
 * - **Las columnas conservan su tipo.** Los textos sin cifrar que ya
 *   existían se siguen leyendo tal cual, así que no hay migración
 *   destructiva ni ventana de servicio caído: lo nuevo se guarda cifrado y
 *   lo viejo se puede cifrar después con `npm run db:encrypt-data`.
 *   El único cambio de esquema es `Contact.phoneHash`.
 *
 * - **Los textos van con el prefijo `enc:v1:` y los objetos que viven en
 *   columnas Json con `encj:v1:`.** Así, al leer, se puede distinguir un
 *   valor cifrado de uno antiguo sin marcar cada columna a mano.
 *
 * - **El teléfono necesita un índice ciego.** La unicidad y la búsqueda
 *   exacta por teléfono usan `phoneHash` (HMAC-SHA256 con la misma llave):
 *   el mismo teléfono produce el mismo hash, pero del hash no se puede
 *   volver al número. Buscar el teléfono por coincidencia parcial ya no es
 *   posible; es el precio de cifrarlo.
 *
 * - **Los nombres de contacto quedan en claro** porque la búsqueda por
 *   texto del panel depende de coincidencias parciales. Está documentado
 *   como límite conocido.
 */

type JsonObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is JsonObject {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }

    return Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Prisma usa clases propias como centinelas (`DbNull`, `JsonNull`) para
 * distinguir "nulo de JSON" de "nulo de base". Esos valores no se cifran.
 */
function isSentinel(value: unknown): boolean {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof Date) &&
        Object.getPrototypeOf(value) !== Object.prototype
    );
}

/** Cifra un campo de texto, aceptando también la forma `{ set: valor }`. */
function encryptText(value: unknown): unknown {
    if (typeof value === "string") {
        return value.length > 0 && !isEncrypted(value)
            ? encryptSecret(value)
            : value;
    }

    if (
        isPlainObject(value) &&
        typeof value.set === "string" &&
        value.set.length > 0 &&
        !isEncrypted(value.set)
    ) {
        return { ...value, set: encryptSecret(value.set) };
    }

    return value;
}

function encryptTextFields(data: JsonObject, fields: string[]) {
    for (const field of fields) {
        if (data[field] === undefined) {
            continue;
        }

        data[field] = encryptText(data[field]);
    }
}

function encryptJsonFields(data: JsonObject, fields: string[]) {
    for (const field of fields) {
        const value = data[field];

        if (
            value === undefined ||
            value === null ||
            isSentinel(value) ||
            isEncryptedJson(value)
        ) {
            continue;
        }

        data[field] = encryptJson(value);
    }
}

type WriteRule = (data: JsonObject) => void;

/**
 * Campos cifrados que no se pueden comparar en un `where`.
 *
 * Una consulta como `where: { body: { contains: "hola" } }` compararía el
 * texto contra el valor cifrado y devolvería cero filas en silencio, que es
 * la peor forma de fallar. Aquí se convierte en un error con explicación.
 *
 * `{ not: null }` sí se permite: pregunta si hay valor, no cuál es.
 */
const ENCRYPTED_FIELDS: Record<string, string[]> = {
    Contact: ["notes", "outcomeAmount"],
    Message: ["body", "mediaFilename", "metaPayload", "metaResponse"],
    CampaignRecipient: ["phone", "variables"],
    Log: ["payload"],
    WebhookEvent: ["payload"],
    QuickReply: ["body"],
    ContactOutcome: ["note", "amount"],
    User: ["email", "twoFactorSecret"],
    WhatsAppNumber: ["phoneNumber"],
    WhatsAppAccount: ["accessToken", "verifyToken"]
};

const COMPARISON_OPERATORS = [
    "equals",
    "contains",
    "startsWith",
    "endsWith",
    "in",
    "notIn",
    "lt",
    "lte",
    "gt",
    "gte"
];

/** ¿La condición compara el campo contra un valor? */
function filterComparesValue(value: unknown, depth = 0): boolean {
    if (typeof value === "string" || Array.isArray(value) || value instanceof Date) {
        return true;
    }

    if (!isPlainObject(value)) {
        return false;
    }

    if (depth > 4) {
        return true;
    }

    return Object.entries(value).some(([operator, operatorValue]) => {
        if (operatorValue === null || operatorValue === undefined) {
            return false;
        }

        if (isPlainObject(operatorValue)) {
            return filterComparesValue(operatorValue, depth + 1);
        }

        return COMPARISON_OPERATORS.includes(operator);
    });
}

function guardEncryptedFilters(
    model: string,
    where: unknown,
    depth = 0
): void {
    const fields = ENCRYPTED_FIELDS[model];

    if (!fields || depth > 6 || !isPlainObject(where)) {
        return;
    }

    for (const [key, value] of Object.entries(where)) {
        if (fields.includes(key) && filterComparesValue(value)) {
            throw new Error(
                `El campo ${model}.${key} está cifrado en la base: no se puede ` +
                    "buscar por su contenido. Filtra por otro campo (por ejemplo " +
                    "el índice ciego del teléfono) o descifra en la aplicación."
            );
        }

        if (
            (key === "AND" || key === "OR" || key === "NOT") &&
            Array.isArray(value)
        ) {
            for (const item of value) {
                guardEncryptedFilters(model, item, depth + 1);
            }
        }
    }
}

const WRITE_RULES: Record<string, WriteRule> = {
    Contact(data) {
        const phone = data.phone;

        if (typeof phone === "string" && phone.length > 0 && !isEncrypted(phone)) {
            data.phone = encryptSecret(phone);
            data.phoneHash = blindIndex(phone);
        }

        encryptTextFields(data, ["notes", "outcomeAmount"]);
    },

    Message(data) {
        encryptTextFields(data, ["body", "mediaFilename"]);
        encryptJsonFields(data, ["metaPayload", "metaResponse"]);
    },

    CampaignRecipient(data) {
        encryptTextFields(data, ["phone"]);
        encryptJsonFields(data, ["variables"]);
    },

    /**
     * Los destinatarios casi siempre se crean anidados dentro de la
     * campaña (`recipients: { create: [...] }`), y eso no pasa por la
     * extensión del modelo. Se aplican aquí las mismas reglas.
     */
    Campaign(data) {
        const recipients = data.recipients;

        if (
            isPlainObject(recipients) &&
            Array.isArray(recipients.create)
        ) {
            for (const recipient of recipients.create) {
                if (isPlainObject(recipient)) {
                    WRITE_RULES.CampaignRecipient(recipient);
                }
            }
        }
    },

    Log(data) {
        encryptJsonFields(data, ["payload"]);
    },

    QuickReply(data) {
        encryptTextFields(data, ["body"]);
    },

    /**
     * El resultado de la gestión: la nota y el monto dicen cuánto debe una
     * persona, así que se cifran. El tipo y las fechas quedan en claro
     * porque los reportes agrupan, filtran y ordenan por ellos.
     */
    ContactOutcome(data) {
        encryptTextFields(data, ["note", "amount"]);
    },

    /**
     * El secreto de la verificación en dos pasos es una credencial: con él se
     * generan los códigos de esa persona. Se cifra como los tokens de Meta.
     *
     * El correo también se cifra, y con él va su índice ciego: es lo que
     * permite mantener la unicidad y resolver el inicio de sesión sin
     * guardarlo en claro. El índice se calcula solo cuando el valor llega en
     * claro: si ya viene cifrado (por ejemplo al restaurar un respaldo, que
     * trae el índice guardado en la misma fila), no se toca para no
     * indexar el texto cifrado.
     */
    User(data) {
        const email = data.email;

        if (typeof email === "string" && email.length > 0 && !isEncrypted(email)) {
            const normalized = normalizeEmail(email);

            data.email = encryptSecret(normalized);
            data.emailHash = blindIndex(normalized);
        } else if (
            isPlainObject(email) &&
            typeof email.set === "string" &&
            email.set.length > 0 &&
            !isEncrypted(email.set)
        ) {
            const normalized = normalizeEmail(email.set);

            data.email = { ...email, set: encryptSecret(normalized) };
            data.emailHash = blindIndex(normalized);
        }

        encryptTextFields(data, ["twoFactorSecret"]);
    },

    /**
     * El evento crudo de Meta trae el teléfono y el contenido del mensaje
     * tal como llegaron. Se cifra completo: el worker lo lee por la misma
     * extensión, así que lo sigue viendo en claro.
     */
    WebhookEvent(data) {
        encryptJsonFields(data, ["payload"]);
    },

    WhatsAppNumber(data) {
        encryptTextFields(data, ["phoneNumber"]);
    },

    WhatsAppAccount(data) {
        /** Defensa en profundidad: el servicio ya los cifra antes. */
        encryptTextFields(data, ["accessToken", "verifyToken"]);
    }
};

/**
 * Traduce las condiciones por teléfono al índice ciego. Todavía no debería
 * hacer falta (los servicios ya lo piden por `phoneHash`), pero evita que
 * una consulta nueva devuelva cero filas en silencio.
 */
function translateContactWhere(where: unknown): unknown {
    if (!isPlainObject(where)) {
        return where;
    }

    const next: JsonObject = {};

    for (const [key, value] of Object.entries(where)) {
        if (key === "workspaceId_phone" && isPlainObject(value)) {
            const phone = value.phone;

            if (typeof phone === "string") {
                next.workspaceId_phoneHash = {
                    workspaceId: value.workspaceId,
                    phoneHash: blindIndex(phone)
                };

                continue;
            }
        }

        if (key === "phone" && typeof value === "string") {
            next.phoneHash = blindIndex(value);
            continue;
        }

        if (key === "phone" && isPlainObject(value) && typeof value.equals === "string") {
            next.phoneHash = {
                ...value,
                equals: blindIndex(value.equals)
            };

            continue;
        }

        if (key === "phone") {
            throw new Error(
                "El teléfono del contacto está cifrado: no se puede filtrar con " +
                    "coincidencias parciales. Usa `phoneHash` con el índice ciego " +
                    "(ver `blindIndex` en utils/crypto)."
            );
        }

        if ((key === "AND" || key === "OR" || key === "NOT") && Array.isArray(value)) {
            next[key] = value.map(translateContactWhere);
            continue;
        }

        next[key] = value;
    }

    return next;
}

/**
 * Traduce las condiciones por correo al índice ciego.
 *
 * Aquí sí es imprescindible: medio sistema busca usuarios por `email` (el
 * inicio de sesión, el alta de usuarios, el reseteo de contraseña por
 * consola). En lugar de cambiar cada consulta, se traduce en un solo lugar y
 * todas siguen escribiendo lo mismo. Si algún día se busca por coincidencia
 * parcial, la guardia de campos cifrados lo detiene con explicación en vez
 * de devolver cero filas.
 */
function translateEmailFilter(value: unknown): unknown {
    if (typeof value === "string") {
        return blindIndex(normalizeEmail(value));
    }

    if (!isPlainObject(value)) {
        return value;
    }

    /**
     * Por partes no se puede: el correo está cifrado y el índice ciego solo
     * sirve para igualdades. Se avisa en lugar de devolver cero filas, que
     * sería la peor forma de fallar.
     */
    if (
        Object.keys(value).some((operator) =>
            ["contains", "startsWith", "endsWith"].includes(operator)
        )
    ) {
        throw new Error(
            "El correo del usuario está cifrado: no se puede buscar por " +
                "coincidencias parciales. Busca por el correo completo (se " +
                "traduce solo al índice ciego) o por otro campo."
        );
    }

    const next: JsonObject = { ...value };

    if (typeof next.equals === "string") {
        next.equals = blindIndex(normalizeEmail(next.equals));
    }

    if (Array.isArray(next.in)) {
        next.in = next.in.map((item) =>
            typeof item === "string" ? blindIndex(normalizeEmail(item)) : item
        );
    }

    if (typeof next.not === "string") {
        next.not = blindIndex(normalizeEmail(next.not));
    }

    return next;
}

function translateUserWhere(where: unknown): unknown {
    if (!isPlainObject(where)) {
        return where;
    }

    const next: JsonObject = {};

    for (const [key, value] of Object.entries(where)) {
        if (key === "email") {
            next.emailHash = translateEmailFilter(value);
            continue;
        }

        if ((key === "AND" || key === "OR" || key === "NOT") && Array.isArray(value)) {
            next[key] = value.map(translateUserWhere);
            continue;
        }

        next[key] = value;
    }

    return next;
}

export function encryptWriteArgs(
    model: string,
    operation: string,
    args: JsonObject
): JsonObject {
    const rule = WRITE_RULES[model];
    const next = { ...args };

    if (rule) {
        const targets: unknown[] = [];

        if (operation === "create" || operation === "update") {
            targets.push(next.data);
        }

        if (operation === "upsert") {
            targets.push(next.create, next.update);
        }

        if (
            operation === "createMany" ||
            operation === "updateMany" ||
            operation === "createManyAndReturn"
        ) {
            if (Array.isArray(next.data)) {
                targets.push(...next.data);
            } else {
                targets.push(next.data);
            }
        }

        for (const target of targets) {
            if (isPlainObject(target)) {
                rule(target);
            }
        }
    }

    if (model === "Contact" && isPlainObject(next.where)) {
        next.where = translateContactWhere(next.where);
    }

    if (model === "User" && isPlainObject(next.where)) {
        next.where = translateUserWhere(next.where);
    }

    if (isPlainObject(next.where)) {
        guardEncryptedFilters(model, next.where);
    }

    return next;
}

/**
 * Descifra cualquier valor que salga de la base, incluidas las relaciones
 * que Prisma incluye dentro del resultado de otra consulta.
 */
export function decryptQueryResult(value: unknown, depth = 0): unknown {
    if (typeof value === "string") {
        if (isEncryptedJson(value)) {
            return decryptQueryResult(decryptJson(value), depth + 1);
        }

        return isEncrypted(value) ? safeDecryptSecret(value) : value;
    }

    if (typeof value !== "object" || value === null) {
        return value;
    }

    if (value instanceof Date || Buffer.isBuffer(value) || depth > 12) {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map((item) => decryptQueryResult(item, depth + 1));
    }

    const next: JsonObject = {};

    for (const [key, item] of Object.entries(value)) {
        next[key] = decryptQueryResult(item, depth + 1);
    }

    return next;
}

/**
 * Devuelve el cliente de Prisma con el cifrado aplicado. Se usa tanto en la
 * aplicación como en el seed, para que las herramientas de línea de comandos
 * escriban los mismos datos cifrados que el panel.
 */
export function withEncryption<T extends PrismaClient>(client: T) {
    return client.$extends({
        name: "cifrado-en-reposo",
        query: {
            $allModels: {
                async $allOperations({ model, operation, args, query }) {
                    const prepared = encryptWriteArgs(
                        model,
                        operation,
                        args as JsonObject
                    );

                    const result = await query(prepared as never);

                    return decryptQueryResult(result) as never;
                }
            }
        }
    });
}

export type EncryptedPrismaClient = ReturnType<typeof withEncryption>;
