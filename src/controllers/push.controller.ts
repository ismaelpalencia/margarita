import { Request, Response } from "express";

import { PushService } from "../services/push.service";

export class PushController {
    static publicKey(_req: Request, res: Response) {
        if (!PushService.isConfigured()) {
            return res.status(503).json({
                error: "Web Push no está configurado."
            });
        }

        return res.json({ publicKey: PushService.getPublicKey() });
    }

    static async subscribe(req: Request, res: Response) {
        const endpoint =
            typeof req.body?.endpoint === "string" ? req.body.endpoint : "";
        const p256dh =
            typeof req.body?.keys?.p256dh === "string"
                ? req.body.keys.p256dh
                : "";
        const auth =
            typeof req.body?.keys?.auth === "string" ? req.body.keys.auth : "";

        if (!endpoint || !p256dh || !auth) {
            return res.status(400).json({ error: "Suscripción inválida." });
        }

        try {
            await PushService.subscribe({
                userId: req.user!.id,
                workspaceId: req.user!.workspaceId,
                endpoint,
                p256dh,
                auth,
                userAgent: req.get("user-agent")
            });

            return res.json({ ok: true });
        } catch (error) {
            return res.status(400).json({
                error:
                    error instanceof Error
                        ? error.message
                        : "No se pudo suscribir."
            });
        }
    }

    static async unsubscribe(req: Request, res: Response) {
        const endpoint =
            typeof req.body?.endpoint === "string" ? req.body.endpoint : "";

        if (!endpoint) {
            return res.status(400).json({ error: "Endpoint inválido." });
        }

        await PushService.unsubscribe(req.user!.id, endpoint);
        return res.json({ ok: true });
    }

    static async test(req: Request, res: Response) {
        const sent = await PushService.sendTest(req.user!.id);

        return res.json({ ok: true, sent });
    }
}
