import { Request, Response } from "express";

import { SystemStatusService } from "../services/system-status.service";
import { appConfig } from "../config/app.config";
import { formatDateTimeMX } from "../utils/date";

export class AdminSystemController {
    static async index(req: Request, res: Response) {
        const status = await SystemStatusService.getAdminStatus(
            req.user!.workspaceId
        );

        return res.render("pages/admin/system/index", {
            user: req.user,
            status,
            version: appConfig.version,
            commit: appConfig.commit,
            /**
             * Los datos de cobro que el operador necesita al facturar. Salen de
             * las mismas variables que la página pública, así que no se pueden
             * contradecir.
             */
            billing: {
                installPromo: appConfig.installPricePromo,
                installList: appConfig.installPrice,
                monthly: appConfig.installMonthlyPrice,
                meta: appConfig.setupServicePrice,
                monthlyList: appConfig.installMonthlyListPrice,
                promoLabel: appConfig.installPromoLabel,
                email: appConfig.supportEmail,
                whatsapp: appConfig.supportWhatsappDisplay
            },
            formatDateTimeMX
        });
    }
}
