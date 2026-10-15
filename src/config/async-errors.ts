import type { NextFunction, Request, Response } from "express";

/**
 * Express 4 no atiende las promesas que devuelven los handlers: si un
 * controlador `async` lanza, la excepción queda como rechazo no manejado y
 * **la petición se queda colgada** sin respuesta. Ni el manejador de errores
 * ni el usuario se enteran; solo aparece un `unhandledRejection` en el log.
 *
 * Este parche envuelve el despacho interno de Express para que cualquier
 * promesa rechazada llegue a `next(error)`. A partir de ahí sí aplica el
 * manejador de errores: la página responde 500, el incidente queda en el log
 * y las alertas externas se disparan.
 *
 * Es un parche sobre un archivo interno de Express a propósito y con
 * cinturón: si la ruta interna cambia en una versión futura, se avisa por
 * consola y la aplicación sigue arrancando como siempre.
 */
export function installAsyncErrorHandling(): boolean {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const layer = require("express/lib/router/layer") as {
            prototype: {
                handle_request: (
                    req: Request,
                    res: Response,
                    next: NextFunction
                ) => unknown;
            };
        };

        const original = layer.prototype.handle_request;

        layer.prototype.handle_request = function patched(
            this: unknown,
            req: Request,
            res: Response,
            next: NextFunction
        ) {
            const result = original.call(this, req, res, next);

            if (
                result &&
                typeof (result as Promise<unknown>).catch === "function"
            ) {
                (result as Promise<unknown>).catch(next);
            }

            return result;
        };

        return true;
    } catch (error) {
        console.warn(
            "[app] No se pudo instalar el manejo de errores en handlers " +
                "asíncronos; una promesa rechazada podría dejar la petición " +
                "sin respuesta. Detalle:",
            error instanceof Error ? error.message : error
        );

        return false;
    }
}
