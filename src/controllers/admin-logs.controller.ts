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
}