import { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";

export function requireRole(...roles: UserRole[]) {
    return function (req: Request, res: Response, next: NextFunction) {
        if (!req.user) {
            return res.redirect("/auth/login");
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).render("pages/errors/403", {
                user: req.user
            });
        }

        return next();
    };
}
