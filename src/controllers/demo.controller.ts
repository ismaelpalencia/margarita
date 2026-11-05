import { Request, Response } from "express";

import { DemoService } from "../services/demo.service";

export class DemoController {
    static show(_req: Request, res: Response) {
        if (!DemoService.enabled()) {
            return res.status(404).type("html").send("<h1>404</h1><p>No encontrado.</p>");
        }

        return res.render("pages/demo/index", {
            title: "Demo de Margarita"
        });
    }

    static session(req: Request, res: Response) {
        if (!DemoService.enabled()) {
            return res.status(404).json({ error: "not_found" });
        }

        const result = DemoService.createSession(req.ip || "unknown");

        if (!result.ok) {
            return res.status(429).json({ error: result.reason });
        }

        return res.json({ sessionId: result.sessionId });
    }

    static async chat(req: Request, res: Response) {
        if (!DemoService.enabled()) {
            return res.status(404).json({ error: "not_found" });
        }

        const sessionId = String(req.body?.sessionId || "");
        const message = String(req.body?.message || "");
        const vertical = String(req.body?.vertical || "comercio");

        const result = await DemoService.chat({ sessionId, message, vertical });

        if (!result.ok) {
            return res.status(result.status).json({ error: result.reason });
        }

        return res.json(result.result);
    }
}