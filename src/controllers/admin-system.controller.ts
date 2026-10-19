import { Request, Response } from "express";

import { SystemStatusService } from "../services/system-status.service";
import { appConfig } from "../config/app.config";
import { formatDateTimeMX } from "../utils/date";
import { probeObjectStorage } from "../services/object-storage.service";
import { storageSummary, StorageSummary } from "../services/object-storage.service";

/**
 * El listado del bucket se cachea cinco minutos: no cambia cada segundo y
 * listar en cada carga del panel sería desperdiciar peticiones a Cloudflare.
 */
let r2Cache: { at: number; value: StorageSummary | null } | null = null;

async function r2Summary(): Promise<StorageSummary | null> {
    if (r2Cache && Date.now() - r2Cache.at < 5 * 60 * 1000) {
        return r2Cache.value;
    }

    let value: StorageSummary | null = null;

    try {
        value = await storageSummary();
    } catch {
        value = null;
    }

    r2Cache = { at: Date.now(), value };

    return value;
}

export function humanBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1048576).toFixed(1)} MB`;

    return `${(bytes / 1073741824).toFixed(2)} GB`;
}

export class AdminSystemController {
    /**
     * Prueba de Cloudflare R2. Devuelve el error tal cual para no adivinar:
     * permisos del token, bucket inexistente o llaves mal copiadas.
     */
    static async testR2(_req: Request, res: Response) {
        const result = await probeObjectStorage();

        return res.status(result.ok ? 200 : 502).json(result);
    }

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
            ,
            r2: await r2Summary(),
            humanBytes
        });
    }
}
