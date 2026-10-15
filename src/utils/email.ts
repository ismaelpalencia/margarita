import { blindIndex } from "./crypto";

/**
 * Forma canónica del correo de acceso.
 *
 * El correo se guarda cifrado y se busca por índice ciego, así que la
 * normalización tiene que ser **la misma** al escribir y al buscar: si el
 * guardado dijera `Juan@Empresa.mx` y la búsqueda `juan@empresa.mx`, el
 * índice no coincidiría y nadie podría entrar. Se usa en un solo lugar y
 * todos lo llaman desde aquí.
 */
export function normalizeEmail(value: string): string {
    return value.trim().toLowerCase();
}

/**
 * Índice ciego del correo: es lo que se guarda en `User.emailHash` y lo que
 * se usa para buscarlo (el correo en sí está cifrado y no se puede comparar).
 * Se calcula con la llave de cifrado, así que de la base no se puede volver
 * al correo.
 */
export function emailIndex(value: string): string {
    return blindIndex(normalizeEmail(value));
}
