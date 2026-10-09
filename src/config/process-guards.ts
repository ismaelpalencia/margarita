import { logger } from "./logger";
import { AlertService } from "../services/alert.service";

let registered = false;

/**
 * Express 4 no propaga los errores de los handlers asíncronos, así que
 * una promesa rechazada dentro de un controlador terminaría tumbando el
 * proceso completo (comportamiento por defecto de Node). En un servicio
 * con un solo operador eso significa perder la atención de los clientes
 * por un error que quizá solo afecta a una pantalla.
 *
 * Aquí se registran y se avisan, pero el proceso sigue en pie. El estado
 * real de la aplicación se reporta en /health.
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
            "Promesa rechazada sin manejar: la aplicación sigue en pie"
        );

        void AlertService.notify({
            title: "Error no manejado",
            message,
            key: "unhandled-rejection"
        });
    });

    process.on("uncaughtException", (error) => {
        logger.error(
            { err: error },
            "Excepción no capturada: la aplicación sigue en pie"
        );

        void AlertService.notify({
            title: "Excepción no capturada",
            message: error.message,
            key: "uncaught-exception"
        });
    });
}
