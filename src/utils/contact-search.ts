import { Prisma } from "@prisma/client";

import { blindIndex } from "./crypto";
import { normalizeName } from "../config/prisma-encryption";
import { isValidPhone, normalizePhone } from "./phone";

/**
 * Condiciones de búsqueda de contactos por texto.
 *
 * El nombre se busca por coincidencia parcial; el teléfono, solo exacto,
 * porque está cifrado y se compara por su índice ciego. Si lo que se
 * escribió no es un teléfono completo, esa parte no se agrega: así una
 * búsqueda por texto no devuelve todo por accidente.
 */
export function contactSearchOr(search: string): Prisma.ContactWhereInput[] {
    const term = search.trim();

    /**
     * El nombre va cifrado, así que ya no se busca por partes: se compara el
     * índice ciego del nombre completo. Es el precio de que un volcado de la
     * base no revele nombres.
     */
    const conditions: Prisma.ContactWhereInput[] = [
        {
            nameHash: blindIndex(normalizeName(term))
        }
    ];

    if (isValidPhone(term)) {
        conditions.push({
            phoneHash: blindIndex(normalizePhone(term))
        });
    }

    return conditions;
}
