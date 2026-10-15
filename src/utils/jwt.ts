import jwt, { SignOptions } from "jsonwebtoken";

import { appConfig } from "../config/app.config";
import { AuthUser } from "../types/auth";

export type JwtPayloadData = {
    sub: string;
    tokenId: string;
    workspaceId: string;
    role: string;
};

export function signAuthToken(payload: JwtPayloadData): string {
    const options: SignOptions = {
        expiresIn: appConfig.jwtExpiresIn as SignOptions["expiresIn"]
    };

    return jwt.sign(payload, appConfig.jwtSecret, options);
}

export function verifyAuthToken(token: string): JwtPayloadData {
    const decoded = jwt.verify(token, appConfig.jwtSecret);

    if (typeof decoded === "string") {
        throw new Error("Token inválido.");
    }

    return {
        sub: String(decoded.sub),
        tokenId: String(decoded.tokenId),
        workspaceId: String(decoded.workspaceId),
        role: String(decoded.role)
    };
}

/**
 * Token temporal del segundo paso del acceso.
 *
 * Cuando la cuenta tiene verificación en dos pasos, la contraseña correcta
 * **no** abre sesión: se entrega este token (5 minutos) y la sesión se crea
 * solo cuando el código es válido. Va firmado con el mismo secreto y lleva su
 * propio propósito, así que no sirve como cookie de sesión.
 */
export function signTwoFactorChallenge(userId: string): string {
    return jwt.sign(
        { sub: userId, purpose: "2fa" },
        appConfig.jwtSecret,
        { expiresIn: "5m" }
    );
}

export function verifyTwoFactorChallenge(token: string): string {
    const decoded = jwt.verify(token, appConfig.jwtSecret);

    if (
        typeof decoded === "string" ||
        decoded.purpose !== "2fa" ||
        !decoded.sub
    ) {
        throw new Error("El desafío de verificación no es válido.");
    }

    return String(decoded.sub);
}

export function userToAuthUser(user: {
    id: string;
    workspaceId: string;
    role: AuthUser["role"];
    email: string;
    name: string;
    mustChangePassword?: boolean;
}): AuthUser {
    return {
        id: user.id,
        workspaceId: user.workspaceId,
        role: user.role,
        email: user.email,
        name: user.name,
        mustChangePassword: Boolean(user.mustChangePassword)
    };
}
