import { Request, Response } from "express";

import { SystemStatusService } from "../services/system-status.service";
import { formatDateTimeMX } from "../utils/date";

export class AdminSystemController {
    static async index(req: Request, res: Response) {
        const status = await SystemStatusService.getAdminStatus(
            req.user!.workspaceId
        );

        return res.render("pages/admin/system/index", {
            user: req.user,
            status,
            formatDateTimeMX
        });
    }
}