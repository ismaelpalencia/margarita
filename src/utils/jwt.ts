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

export function userToAuthUser(user: {
    id: string;
    workspaceId: string;
    role: AuthUser["role"];
    email: string;
    name: string;
}): AuthUser {
    return {
        id: user.id,
        workspaceId: user.workspaceId,
        role: user.role,
        email: user.email,
        name: user.name
    };
}
