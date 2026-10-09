import { Router } from "express";
import rateLimit from "express-rate-limit";

import { AuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

/**
 * Límite propio para el login: frena ataques de fuerza bruta sin depender
 * del límite general, que es mucho más permisivo.
 */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Demasiados intentos de acceso. Espera unos minutos."
});

router.get("/login", AuthController.showLogin);
router.post("/login", loginLimiter, AuthController.login);
router.post("/logout", authMiddleware, AuthController.logout);

export default router;
