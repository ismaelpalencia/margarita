import { logger } from "../config/logger";
import { prisma } from "../config/prisma";
import { blindIndex } from "../utils/crypto";
import { normalizeMexicanPhone } from "../utils/phone";

/**
 * Marca temporal que la migración deja en `Contact.phoneHash`.
 *
 * El índice ciego de un teléfono no se puede calcular dentro de la
 * migración porque depende de la llave de cifrado, y esa llave nunca está
 * en la base de datos. Así que la migración marca cada fila existente y la
 * aplicación las recalcula al arrancar.
 */
export const LEGACY_PHONE_HASH_PREFIX = "legacy:";

/**
 * Recalcula el índice ciego de los contactos que quedaron marcados.
 *
 * Es importante que corra antes de atender webhooks: si un contacto viejo
 * conserva el marcador, la búsqueda por teléfono no lo encuentra y un
 * mensaje entrante crearía un contacto duplicado.
 */
export async function backfillPhoneHashes(): Promise<number> {
    const pending = await prisma.contact.findMany({
        where: {
            phoneHash: {
                startsWith: LEGACY_PHONE_HASH_PREFIX
            }
        },
        select: {
            id: true,
            phone: true
        }
    });

    if (pending.length === 0) {
        return 0;
    }

    logger.info(
        { total: pending.length },
        "Recalculando el índice de teléfono de contactos anteriores al cifrado."
    );

    let updated = 0;

    for (const contact of pending) {
        let phone = contact.phone;

        try {
            phone = normalizeMexicanPhone(contact.phone);
        } catch {
            /** Se conserva el valor tal cual: puede ser un número antiguo. */
        }

        try {
            await prisma.contact.update({
                where: {
                    id: contact.id
                },
                data: {
                    phoneHash: blindIndex(phone)
                }
            });

            updated += 1;
        } catch (error) {
            logger.error(
                {
                    contactId: contact.id,
                    error: error instanceof Error ? error.message : error
                },
                "No se pudo recalcular el índice de teléfono: puede haber otro contacto con el mismo número."
            );
        }
    }

    logger.info({ updated }, "Índices de teléfono actualizados.");

    return updated;
}
