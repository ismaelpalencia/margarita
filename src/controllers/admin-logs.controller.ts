import { Request, Response } from "express";

import { AdminLogService } from "../services/admin-log.service";

export class AdminLogsController {
    static async index(req: Request, res: Response) {
        const logs = await AdminLogService.listLogs({
            workspaceId: req.user!.workspaceId,
            level:
                typeof req.query.level === "string"
                    ? req.query.level
                    : undefined,
            module:
                typeof req.query.module === "string"
                    ? req.query.module
                    : undefined
        });

        return res.render("pages/admin/logs/index", {
            user: req.user,
            logs,
            filters: {
                level: req.query.level || "",
                module: req.query.module || ""
            }
        });
    }

    /**
     * Volcado crudo de los últimos webhooks.
     *
     * Es la pantalla que se abre cuando hay que comprobar qué mandó Meta —el
     * identificador de un botón, por ejemplo— o cuando hay que pegar el evento
     * completo en un reporte.
     */
    static async webhooks(req: Request, res: Response) {
        const events = await AdminLogService.listWebhookEvents({
            workspaceId: req.user!.workspaceId
        });

        return res.render("pages/admin/logs/webhooks", {
            user: req.user,
            events,
            /** Se muestra el JSON indentado, que es lo que se copia. */
            prettyPrint: (value: unknown) => JSON.stringify(value, null, 2)
        });
    }
}
