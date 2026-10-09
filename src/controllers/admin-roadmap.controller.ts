import { Request, Response } from "express";

export class AdminRoadmapController {
    static async index(req: Request, res: Response) {
        return res.render("pages/admin/roadmap/index", {
            user: req.user
        });
    }
}