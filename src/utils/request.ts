import { Request } from "express";

export function getRequiredParam(req: Request, name: string): string {
    const value = req.params[name];

    if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`Parámetro requerido inválido: ${name}`);
    }

    return value;
}