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

        if (req.accepts("json") && !req.accepts("html")) {
            return res.json({ logs: logs.map(({ id, level, module, createdAt, action, message, payload }) => ({ id, level, module, createdAt, action, message, payload })), filters: { level: req.query.level || "", module: req.query.module || "" } });
        }
        const query = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
        return res.redirect(`/panel/admin/logs${query}`);
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

        if (req.accepts("json") && !req.accepts("html")) return res.json({ events });
        return res.redirect("/panel/admin/logs/webhooks");
    }
}
