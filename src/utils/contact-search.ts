import { Prisma } from "@prisma/client";

import { blindIndex } from "./crypto";
import { isValidMexicanPhone, normalizeMexicanPhone } from "./phone";

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

    const conditions: Prisma.ContactWhereInput[] = [
        {
            customName: {
                contains: term,
                mode: "insensitive"
            }
        },
        {
            profileName: {
                contains: term,
                mode: "insensitive"
            }
        }
    ];

    if (isValidMexicanPhone(term)) {
        conditions.push({
            phoneHash: blindIndex(normalizeMexicanPhone(term))
        });
    }

    return conditions;
}
