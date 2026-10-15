import { logger } from "../config/logger";
import { prisma } from "../config/prisma";

/**
 * Marca temporal que la migración de cifrado deja en `User.emailHash`.
 *
 * El índice ciego de un correo no se puede calcular dentro de la migración
 * porque depende de la llave de cifrado, y esa llave nunca está en la base
 * de datos. Así que la migración marca cada fila existente y la aplicación
 * las recalcula al arrancar, antes de atender peticiones: mientras el
 * marcador siga ahí, ese usuario no podría entrar.
 */
export const LEGACY_EMAIL_HASH_PREFIX = "legacy:";

/**
 * Cifra el correo de los usuarios que existían antes y calcula su índice
 * ciego. La escritura pasa por la extensión de cifrado, que es la que sabe
 * cifrar y calcular el índice: aquí solo se le entrega el correo en claro
 * que la propia extensión devuelve al leer.
 */
export async function backfillUserEmails(): Promise<number> {
    const pending = await prisma.user.findMany({
        where: {
            emailHash: {
                startsWith: LEGACY_EMAIL_HASH_PREFIX
            }
        },
        select: {
            id: true,
            email: true
        }
    });

    if (pending.length === 0) {
        return 0;
    }

    logger.info(
        { total: pending.length },
        "Cifrando el correo de los usuarios anteriores al cifrado y calculando su índice."
    );

    let updated = 0;

    for (const user of pending) {
        try {
            await prisma.user.update({
                where: {
                    id: user.id
                },
                data: {
                    email: user.email
                }
            });

            updated += 1;
        } catch (error) {
            logger.error(
                {
                    userId: user.id,
                    error: error instanceof Error ? error.message : error
                },
                "No se pudo cifrar el correo de un usuario. Podría haber otro con el mismo correo; revisa Equipo."
            );
        }
    }

    logger.info({ updated }, "Correos de acceso cifrados.");

    return updated;
}
