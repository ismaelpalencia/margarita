import { logger } from "./logger";
import { AlertService } from "../services/alert.service";

let registered = false;
let fatalExitScheduled = false;

function exitAfterFatalError() {
    if (fatalExitScheduled) {
        return undefined;
    }

    fatalExitScheduled = true;
    process.exitCode = 1;

    /** Give the logger and optional alert a brief chance to flush. */
    return setTimeout(() => process.exit(1), 9000);
}

/**
 * Express 4 no propaga los errores de los handlers asíncronos, así que
 * una promesa rechazada dentro de un controlador terminaría tumbando el
 * proceso completo (comportamiento por defecto de Node). En un servicio
 * con un solo operador eso significa perder la atención de los clientes
 * por un error que quizá solo afecta a una pantalla.
 *
 * Los fallos no capturados se registran y notifican; el proceso sale para
 * que el supervisor lo reinicie en vez de continuar con estado incierto.
 */
export function registerProcessGuards() {
    if (registered) {
        return;
    }

    registered = true;

    process.on("unhandledRejection", (reason) => {
        const message =
            reason instanceof Error ? reason.message : String(reason);

        logger.error(
            { err: reason },
            "Promesa rechazada sin manejar: el proceso terminará"
        );

        const forceExit = exitAfterFatalError();

        void AlertService.notify({
            title: "Error no manejado",
            message,
            key: "unhandled-rejection"
        }).finally(() => {
            if (forceExit) {
                clearTimeout(forceExit);
            }

            process.exit(1);
        });
    });

    process.on("uncaughtException", (error) => {
        logger.error(
            { err: error },
            "Excepción no capturada: el proceso terminará"
        );

        const forceExit = exitAfterFatalError();

        void AlertService.notify({
            title: "Excepción no capturada",
            message: error.message,
            key: "uncaught-exception"
        }).finally(() => {
            if (forceExit) {
                clearTimeout(forceExit);
            }

            process.exit(1);
        });
    });
}
